from aws_cdk import (
    Stack,
    RemovalPolicy,
    Duration,
    CfnOutput,
    aws_route53 as route53,
    aws_route53_targets as targets,
    aws_certificatemanager as acm,
    aws_apigateway as apigateway,
    aws_lambda as _lambda,
    aws_iam as iam,
    aws_ses as ses,
)
from constructs import Construct
import environments

SE_ROOT_ACCOUNT = environments.software_engineering['ROOT']
SE_DEV_ACCOUNT = environments.software_engineering['DEV']
SE_TESTING_ACCOUNT = environments.software_engineering['TESTING']
SE_PROD_ACCOUNT = environments.software_engineering['PROD']

def _get_account_name(self) -> str:
    for env_name, env_info in environments.software_engineering.items():
        if env_info.account == self.account:
            return env_name.capitalize()
    return "Unknown"

class SERootNetworkingStack(Stack):

    def __init__(
            self,
            scope: Construct,
            construct_id: str,
            services_domain: str,
            **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # REFERENCES: https://dev.to/aws-builders/allowing-an-aws-account-to-delegate-dns-subdomains-to-another-account-in-two-simple-cdk-stacks-1pcm

        # Import the original hosted zone in SE ROOT where the domain lives
        # This was created via the console when purchasing the domain
        self.hosted_zone = route53.HostedZone.from_lookup(
            self,
            "ServicesHostedZoneRoot",
            domain_name=services_domain
        )

        # Define all child-accounts that will be allowed to delegate to this hosted zone
        principals = [
            iam.AccountPrincipal(SE_DEV_ACCOUNT.account),
            iam.AccountPrincipal(SE_TESTING_ACCOUNT.account),
            iam.AccountPrincipal(SE_PROD_ACCOUNT.account),
        ]

        composite_principal = iam.CompositePrincipal(*principals)

        # Define role to be used for delegation
        self.delegation_role = iam.Role(
            self,
            "ServicesDelegationRole",
            assumed_by=composite_principal,
            role_name="ServicesDelegationRole",
        )

        # Grant permissions to the delegation role
        self.hosted_zone.grant_delegation(self.delegation_role)

        CfnOutput(self, "ServicesDelegationRoleArn",
                  value=self.delegation_role.role_arn)


class SENetworkingStack(Stack):

    def __init__(
            self,
            scope: Construct,
            construct_id: str,
            services_domain: str,
            **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        ACCOUNT_NAME = _get_account_name(self)

        # Create a hosted zone in SE child-account
        # (Not in SE ROOT where the original hosted zone + domain lives)
        self.hosted_zone = route53.HostedZone(
            self,
            f"ServicesHostedZone{ACCOUNT_NAME}",
            zone_name=f'{ACCOUNT_NAME.lower()}.{services_domain}',
        )
        CfnOutput(self, "ServicesHostedZoneId",
                  value=self.hosted_zone.hosted_zone_id)

        # STOP HERE
        """
            To create a certificate, AWS needs to validate domain ownership, preferrably via DNS.
            Since the domain is in SE_ROOT, we need to add a NS record in the original hosted zone
            to the newly created hosted zone. This is done via the delegation role.
        """
        self.delegation_role = iam.Role.from_role_arn(
            self,
            "ServicesDelegationRole",
            f"arn:aws:iam::{SE_ROOT_ACCOUNT.account}:role/ServicesDelegationRole"
        )

        # Add NS record to original hosted zone
        route53.CrossAccountZoneDelegationRecord(
            self,
            "ServicesZoneDelegationRecord",
            delegated_zone=self.hosted_zone,
            delegation_role=self.delegation_role,
            parent_hosted_zone_name=services_domain,
            ttl=Duration.minutes(5),
        )

        # Request a certificate
        self.certificate = acm.Certificate(
            self,
            "ServicesCertificate",
            domain_name=f"{ACCOUNT_NAME.lower()}.{services_domain}",
            validation=acm.CertificateValidation.from_dns(self.hosted_zone)
        )
        CfnOutput(self, "ServicesCertificateArn",
                  value=self.certificate.certificate_arn)

        # Create the API Gateway
        self.api = apigateway.RestApi(
            self,
            f"ServicesAPI{ACCOUNT_NAME}",
            rest_api_name="ServicesAPI",
            description=f"This is an API endpoint to support SE services in the {ACCOUNT_NAME} environment.",
            endpoint_types=[apigateway.EndpointType.REGIONAL],
            disable_execute_api_endpoint=True,
            binary_media_types=['application/vnd.ms-excel', 'text/csv']
        )
        CfnOutput(
            self,
            "ServicesAPIId",
            value=self.api.rest_api_id,
            export_name="ServicesAPIId"
        )

        CfnOutput(
            self,
            "ServicesAPIRootResourceId",
            value=self.api.root.resource_id,
            export_name="ServicesAPIRootResourceId"
        )

        # Define a dummy resource and method
        dummy_resource = self.api.root.add_resource("mock")

        # Create a Lambda function as a placeholder
        dummy_function = _lambda.Function(
            self, "DummyFunction",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="index.handler",
            code=_lambda.Code.from_inline(
                "def handler(event, context): return {'statusCode': 200, 'body': 'OK'}")
        )

        # Add a dummy GET method to the dummy resource
        dummy_resource.add_method(
            "GET",
            apigateway.LambdaIntegration(dummy_function)
        )

        # Create a custom domain
        # Format example: dev.{domain}, testing.{domain}, prod.{domain}
        self.custom_domain = apigateway.DomainName(
            self,
            "ServicesAPICustomDomain",
            domain_name=f"{ACCOUNT_NAME.lower()}.{services_domain}",
            certificate=self.certificate,
            endpoint_type=apigateway.EndpointType.REGIONAL
        )

        # Map custom domain to API
        apigateway.BasePathMapping(
            self,
            "ServicesAPIBasePathMapping",
            domain_name=self.custom_domain,
            rest_api=self.api
        )

        # Create an alias record for the custom domain in the hosted zone
        route53.ARecord(
            self,
            f"{ACCOUNT_NAME.capitalize()}AliasRecord",
            zone=self.hosted_zone,
            record_name=f"{ACCOUNT_NAME.lower()}.{services_domain}",
            target=route53.RecordTarget.from_alias(
                targets.ApiGatewayDomain(self.custom_domain)),
        )

        CfnOutput(
            self,
            f"{ACCOUNT_NAME}CustomAPIEndpoint",
            value=f"https://{ACCOUNT_NAME.lower()}.{services_domain}/"
        )

        """
            References:
            https://stackoverflow.com/questions/49826230/regional-edge-optimized-api-gateway-vs-regional-edge-optimized-custom-domain-nam
            https://stackoverflow.com/questions/76633344/aws-route53-different-aws-accounts-with-same-hosting-zone-name
            https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-values-alias.html
        """

        # AWS SES — EMAIL SERVICE
        services_ses_identity = ses.EmailIdentity(
            self,
            "ServicesIdentity",
            identity=ses.Identity.public_hosted_zone(self.hosted_zone),
        )