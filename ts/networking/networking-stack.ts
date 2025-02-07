import {
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  CfnOutput,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_certificatemanager as acm,
  aws_apigateway as apigateway,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_ses as ses,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { softwareEngineering } from "../environments";

const SE_ROOT_ACCOUNT = softwareEngineering["ROOT"];
const SE_DEV_ACCOUNT = softwareEngineering["DEV"];
const SE_TESTING_ACCOUNT = softwareEngineering["TESTING"];
const SE_PROD_ACCOUNT = softwareEngineering["PROD"];

function getAccountName(account: string): string {
  for (const [envName, envInfo] of Object.entries(softwareEngineering)) {
    if (envInfo.account === account) {
      return envName.charAt(0).toUpperCase() + envName.slice(1).toLowerCase();
    }
  }
  return "Unknown";
}

interface NetworkingStackProps extends StackProps {
  /**
   * The root domain name for the services (e.g., "mycompany.com")
   */
  servicesDomain: string;

  /**
   * Whether to create a shared API Gateway endpoint for this environment.
   *
   * Enable this when you need a centralized API endpoint that can be used
   * across multiple services/projects within the same environment. This is useful for:
   * - Maintaining a single API domain for all services
   * - Sharing API resources and configurations
   * - Reducing costs by consolidating API endpoints
   * - Simplifying API management and monitoring
   *
   * @default false
   */
  createApiGateway?: boolean;

  /**
   * Whether to create an SES (Simple Email Service) configuration for this environment.
   *
   * Enable this when you need email capabilities within your environment. Common use cases include:
   * - System notifications and alerts
   * - Application logging via email
   * - User communication (transactional emails)
   * - Report distribution
   *
   * The email service will be configured with the environment's subdomain
   * and proper DNS verification records.
   *
   * @default false
   */
  createEmailService?: boolean;
}

export class SERootNetworkingStack extends Stack {
  public readonly hostedZone: route53.IHostedZone;
  public readonly delegationRole: iam.Role;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    /**
     * @see https://dev.to/aws-builders/allowing-an-aws-account-to-delegate-dns-subdomains-to-another-account-in-two-simple-cdk-stacks-1pcm
     *
     * Import the original hosted zone in SE ROOT where the domain lives.
     * This was created via the console when purchasing the domain.
     */
    this.hostedZone = route53.HostedZone.fromLookup(
      this,
      "ServicesHostedZoneRoot",
      {
        domainName: props.servicesDomain,
      }
    );

    /**
     * All child accounts that will be allowed to delegate to this hosted zone.
     */
    const principals = [
      new iam.AccountPrincipal(SE_DEV_ACCOUNT.account),
      new iam.AccountPrincipal(SE_TESTING_ACCOUNT.account),
      new iam.AccountPrincipal(SE_PROD_ACCOUNT.account),
    ];

    const compositePrincipal = new iam.CompositePrincipal(...principals);

    this.delegationRole = new iam.Role(this, "ServicesDelegationRole", {
      assumedBy: compositePrincipal,
      roleName: "ServicesDelegationRole",
    });

    this.hostedZone.grantDelegation(this.delegationRole);

    new CfnOutput(this, "ServicesDelegationRoleArn", {
      value: this.delegationRole.roleArn,
    });
  }
}

export class SENetworkingStack extends Stack {
  public readonly hostedZone: route53.HostedZone;
  public readonly certificate: acm.Certificate;
  public readonly api?: apigateway.RestApi;
  public readonly customDomain?: apigateway.DomainName;

  constructor(scope: Construct, id: string, props: NetworkingStackProps) {
    super(scope, id, props);

    const ACCOUNT_NAME = getAccountName(this.account);

    /**
     * Create a hosted zone in SE child-account.
     * The original hosted zone lives in SE ROOT.
     */
    this.hostedZone = new route53.HostedZone(
      this,
      `ServicesHostedZone${ACCOUNT_NAME}`,
      {
        zoneName: `${ACCOUNT_NAME.toLowerCase()}.${props.servicesDomain}`,
      }
    );

    new CfnOutput(this, "ServicesHostedZoneId", {
      value: this.hostedZone.hostedZoneId,
    });

    /**
     * To create a certificate, AWS needs to validate domain ownership, preferrably via DNS.
     * Since the domain is in SE_ROOT, we need to add a NS record in the original hosted zone
     * to the newly created hosted zone. This is done via the delegation role.
     */
    const delegationRole = iam.Role.fromRoleArn(
      this,
      "ServicesDelegationRole",
      `arn:aws:iam::${SE_ROOT_ACCOUNT.account}:role/ServicesDelegationRole`
    );

    /**
     * Add NS record to original hosted zone.
     */
    new route53.CrossAccountZoneDelegationRecord(
      this,
      "ServicesZoneDelegationRecord",
      {
        delegatedZone: this.hostedZone,
        delegationRole: delegationRole,
        parentHostedZoneName: props.servicesDomain,
        ttl: Duration.minutes(5),
      }
    );

    /**
     * Request a certificate.
     */
    this.certificate = new acm.Certificate(this, "ServicesCertificate", {
      domainName: `${ACCOUNT_NAME.toLowerCase()}.${props.servicesDomain}`,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    new CfnOutput(this, "ServicesCertificateArn", {
      value: this.certificate.certificateArn,
    });

    /**
     * Create the API Gateway if enabled
     */
    if (props.createApiGateway) {
      this.api = new apigateway.RestApi(this, `ServicesAPI${ACCOUNT_NAME}`, {
        restApiName: "ServicesAPI",
        description: `This is an API endpoint to support SE services in the ${ACCOUNT_NAME} environment.`,
        endpointTypes: [apigateway.EndpointType.REGIONAL],
        disableExecuteApiEndpoint: true,
        binaryMediaTypes: ["application/vnd.ms-excel", "text/csv"],
      });

      new CfnOutput(this, "ServicesAPIId", {
        value: this.api.restApiId,
        exportName: "ServicesAPIId",
      });

      new CfnOutput(this, "ServicesAPIRootResourceId", {
        value: this.api.root.resourceId,
        exportName: "ServicesAPIRootResourceId",
      });

      /**
       * Define a dummy resource and method.
       */
      const dummyResource = this.api.root.addResource("mock");

      /**
       * Create a Lambda function as a placeholder.
       */
      const dummyFunction = new lambda.Function(this, "DummyFunction", {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "index.handler",
        code: lambda.Code.fromInline(
          "def handler(event, context): return {'statusCode': 200, 'body': 'OK'}"
        ),
      });

      /**
       * Add a dummy GET method to the dummy resource.
       */
      dummyResource.addMethod(
        "GET",
        new apigateway.LambdaIntegration(dummyFunction)
      );

      /**
       * Create a custom domain.
       */
      this.customDomain = new apigateway.DomainName(
        this,
        "ServicesAPICustomDomain",
        {
          domainName: `${ACCOUNT_NAME.toLowerCase()}.${props.servicesDomain}`,
          certificate: this.certificate,
          endpointType: apigateway.EndpointType.REGIONAL,
        }
      );

      /**
       * Map custom domain to API.
       */
      new apigateway.BasePathMapping(this, "ServicesAPIBasePathMapping", {
        domainName: this.customDomain,
        restApi: this.api,
      });

      /**
       * Create an alias record for the custom domain in the hosted zone.
       */
      new route53.ARecord(this, `${ACCOUNT_NAME}AliasRecord`, {
        zone: this.hostedZone,
        recordName: `${ACCOUNT_NAME.toLowerCase()}.${props.servicesDomain}`,
        target: route53.RecordTarget.fromAlias(
          new targets.ApiGatewayDomain(this.customDomain)
        ),
      });

      new CfnOutput(this, `${ACCOUNT_NAME}CustomAPIEndpoint`, {
        value: `https://${ACCOUNT_NAME.toLowerCase()}.${props.servicesDomain}/`,
      });
    }

    /**
     * AWS SES — EMAIL SERVICE (optional)
     */
    if (props.createEmailService) {
      const servicesIdentity = new ses.EmailIdentity(this, "ServicesIdentity", {
        identity: ses.Identity.publicHostedZone(this.hostedZone),
      });
    }
  }
}
