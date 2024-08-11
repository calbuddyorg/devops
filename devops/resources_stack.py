from aws_cdk import (
    Stack,
    SecretValue,
    RemovalPolicy,
    aws_iam as iam,
    aws_secretsmanager as secretsmanager,
    aws_kms as kms,
)
from constructs import Construct
import environments

class SEDevOpsResourcesStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Create a KMS key for the secret
        self.kms_key = kms.Key(
            self, 
            "SERootKMSKey", 
            alias="SE_Root_KMS_Key",
            description="This KMS key is used to encrypt SE resources that need customer-managed keys.",
            enable_key_rotation=True,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # Grant access to child accounts
        for environment_name in environments.software_engineering:
            # Skip ROOT account
            if environment_name in ['ROOT']: continue
            self.kms_key.grant(
                iam.AccountPrincipal(environments.software_engineering[environment_name].account),
                "kms:CreateGrant",
                "kms:Decrypt",
                "kms:DescribeKey",
                "kms:Encrypt",
                "kms:GenerateDataKey*",
                "kms:ReEncrypt*"
            )

        # Create a secret in the SE_ROOT account for IAM Configs
        self.se_secret = secretsmanager.Secret(
            self,
            "SEConfigs",
            description="This secret stores general configurations for SE projects.",
            secret_name="SE_Configuration",
            encryption_key=self.kms_key,
            removal_policy=RemovalPolicy.DESTROY,
            secret_object_value={
                "se-root-kms-key-arn" : SecretValue.unsafe_plain_text(self.kms_key.key_arn)
            }
        )
        
        # Grant child accounts
        for environment_name in environments.software_engineering:
            # Skip ROOT account
            if environment_name in ['ROOT']: continue
            self.se_secret.grant_read(
                iam.AccountPrincipal(environments.software_engineering[environment_name].account)
            )