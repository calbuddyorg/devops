from aws_cdk import (
    Stack,
    CfnOutput,
    aws_iam as iam,
    aws_secretsmanager as secretsmanager,
)
from constructs import Construct
import json
import environments

def policy_reader(filename):
    """
    Reads an IAM policy from a JSON file and returns the object.

    Parameters:
    filename (str): The name of the JSON file containing the IAM policy document, e.g.,
    'devops/policy_definitions/SE_DenyIAMRiskyActions.json'.

    Returns:
    A JSON object representing the IAM policy.

    Raises:
    FileNotFoundError: If the specified file does not exist.
    json.JSONDecodeError: If the file is not a valid JSON policy_document.
    """
    with open(f'devops/policy_definitions/{filename}', 'r') as file:
        return json.load(file)

class SEIamPolicyStack(Stack):

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        secret_arn: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        '''
        There is a maximum of 10 customer-managed policies per permission set
        and a maximum of 10 AWS-managed policies per permission set.
        and a maximum of 6,144 characters in a managed policy.
        AWS doesn't count white spaces as part of the character limit.
        '''
        devops_policy = iam.CfnManagedPolicy(
            self,
            "DevOpsFullAccess",
            policy_document=policy_reader('SE_DevOps.json'),
            description="This IAM policy provides full access to various AWS services\
                considered DevOps services, allowing all actions on these services\
                across all resources.",
            managed_policy_name="SE_DevOpsFullAccess",
        )

        db_policy = iam.CfnManagedPolicy(
            self,
            "DBFullAccess",
            policy_document=policy_reader('SE_DBFullAccess.json'),
            description="This IAM policy grants full access to a range of AWS database\
                and storage services, including RDS, DynamoDB, Redshift, S3, and various\
                backup services. It allows all actions on these services across all resources.",
            managed_policy_name="SE_DBFullAccess",
        )

        dev_policy = iam.CfnManagedPolicy(
            self,
            "DevFullAccess",
            policy_document=policy_reader('SE_DevFullAccess.json'),
            description="This IAM policy grants full access to a range of AWS services",
            managed_policy_name="SE_DevFullAccess",
        )

        deny_iam_risky_policy = iam.CfnManagedPolicy(
            self,
            "IAMRiskyActions",
            policy_document=policy_reader('SE_DenyIAMRiskyActions.json'),
            description="This IAM policy denies a range of potentially risky IAM actions,\
                such as creating users, changing passwords, and updating account details, \
                across all resources. Additionally, it specifically prevents editing of \
                policies starting with 'SE_' by the policy holder.",
            managed_policy_name="SE_DenyIAMRiskyActions",
        )

        # region SE CUSTOM POLICY FOR EACH ORGANIZATION UNIT
        for environment_name in environments.software_engineering:
            # Skip ROOT account
            if environment_name in ['ROOT']: continue
            # Conditionally create a custom policy for each environment
            # if self.account == environments.software_engineering[environment_name].account:
            #     custom_policy = iam.CfnManagedPolicy(
            #         self,
            #         f"CUSTOM_{environment_name}",
            #         policy_document=policy_reader(f'SE_CUSTOM_{environment_name}.json'),
            #         description=f"Special and carefully designed policies for the SE {environment_name} Organization Unit",
            #         managed_policy_name=f"SE_CUSTOM_{environment_name}",
            #     )

        # endregion
        
        # region SNOWFLAKE SPECIAL PERMISSIONS
        snowflake_policy = iam.CfnManagedPolicy(
            self,
            "SnowflakeStorageIntegrationPolicy",
            policy_document=policy_reader('SE_SnowflakeStorageIntegration.json'),
            description="Storage integration for S3 buckets located in our AWS Account. \
                This allows access to Snowflake. Be aware of the snowflake_external_id.",
            managed_policy_name="SE_SnowflakeStorageIntegration",
        )

        se_config_secret = secretsmanager.Secret.from_secret_partial_arn(
            self,
            "SEConfigSecret",
            secret_arn
        )

        CfnOutput(
            self,
            "SERootSecretArn",
            value=secret_arn,
            export_name="SERootSecretArn",
        )

        snowflake_external_id = se_config_secret.secret_value_from_json(f'snowflake-external-id-{self.account}').unsafe_unwrap()

        snowflake_role = iam.Role(
            self,
            "SnowflakeStorageIntegrationRole",
            assumed_by=iam.PrincipalWithConditions(
                principal=iam.ArnPrincipal(
                    se_config_secret.secret_value_from_json("snowflake-principal-arn").unsafe_unwrap()
                ),
                conditions={
                    "StringEquals": {
                        "sts:ExternalId": snowflake_external_id,
                    }
                }
            ),
            role_name="Snowflake_Storage_Integration_Role",
            managed_policies=[
                iam.ManagedPolicy.from_managed_policy_arn(
                    self,
                    "SnowflakeStorageIntegrationPolicyImport",
                    managed_policy_arn=snowflake_policy.attr_policy_arn
                )
            ],
        )

        # endregion
