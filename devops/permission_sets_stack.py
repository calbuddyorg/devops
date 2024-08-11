from aws_cdk import (
    Stack,
    aws_iam as iam,
    aws_sso as sso,
)
from constructs import Construct

import os

'''
    THIS STACK LIVES IN THE ROOT ACCOUNT AND NEEDS TO BE HARD-CODED.
    PERMISSION-SETS NEED TO BE CAREFULLY EXAMINED.
    LEVERAGE THE ALREADY DEFINED CUSTOMER-MANAGED POLICIES.

    PERMISSION SETS CANNOT BE ASSIGNED / PROVISIONED VIA CODE.
    THEY MUST BE MANUALLY PROVISIONED IN THE SSO MANAGEMENT CONSOLE.
    THE ROOT ADMIN IS WHO DECIDES WHETHER TO PROVISION A PERMISSION SET OR PROPOSE CHANGES.

    The goal behind this implementation is to update/mantain already provisioned permission sets
    AWS automatically re-provisions the permission set whenever there is a change.
'''

# AWS-managed policies
readonly_policy = iam.ManagedPolicy.from_aws_managed_policy_name(
    "ReadOnlyAccess")
readbilling_policy = iam.ManagedPolicy.from_aws_managed_policy_name(
    "AWSBillingReadOnlyAccess")
class SEPermissionSetStack(Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        sso_instance_arn: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        '''
            There is a maximum of 10 customer-managed policies per permission set
            and a maximum of 10 AWS-managed policies per permission set.
            and a maximum of 6,144 characters in a managed policy.
            AWS doesn't count white spaces as part of the character limit.
        '''

        SE_DEV_PERMISSION_SET = sso.CfnPermissionSet(
            self,
            'DEV_PERMISSION_SET',
            name='SE_DEV',
            description='Grants full-access to core AWS services. Intended for SE DEV OU ONLY.',
            instance_arn=sso_instance_arn,
            customer_managed_policy_references=[
                {"name": "SE_DevOpsFullAccess"},
                {"name": "SE_DBFullAccess"},
                {"name": "SE_DevFullAccess"},
                {"name": "SE_DenyIAMRiskyActions"},
                {"name": "SE_CUSTOM_DEV"},
            ],
            managed_policies=[
                readonly_policy.managed_policy_arn,
                readbilling_policy.managed_policy_arn
            ],
            session_duration='PT8H',
        )

        SE_PROD_PERMISSION_SET = sso.CfnPermissionSet(
            self,
            'PROD_PERMISSION_SET',
            name='SE_PROD',
            description='Allows read-only and basic/limited access to the SE PRODUCTION OU.',
            instance_arn=sso_instance_arn,
            customer_managed_policy_references=[
                {"name": "SE_DenyIAMRiskyActions"},
                {"name": "SE_CUSTOM_PROD"},
            ],
            managed_policies=[
                readonly_policy.managed_policy_arn,
                readbilling_policy.managed_policy_arn
            ],
            session_duration='PT8H',
        )

        SE_TESTING_PERMISSION_SET = sso.CfnPermissionSet(
            self,
            'TESTING_PERMISSION_SET',
            name='SE_TESTING',
            description='Allows read-only and basic/limited access to the SE TESTING OU.',
            instance_arn=sso_instance_arn,
            customer_managed_policy_references=[
                {"name": "SE_DenyIAMRiskyActions"},
                {"name": "SE_CUSTOM_TESTING"},
            ],
            managed_policies=[
                readonly_policy.managed_policy_arn,
                readbilling_policy.managed_policy_arn
            ],
            session_duration='PT8H',
        )

        SE_ROOT_PERMISSION_SET = sso.CfnPermissionSet(
            self,
            'ROOT_PERMISSION_SET',
            name='SE_ROOT',
            description='Allows read-only and basic/limited access to the ROOT OU.',
            instance_arn=sso_instance_arn,
            customer_managed_policy_references=[
                {"name": "SE_DenyIAMRiskyActions"},
                {"name": "SE_CUSTOM_ROOT"},
            ],
            managed_policies=[
                readonly_policy.managed_policy_arn,
                readbilling_policy.managed_policy_arn
            ],
            session_duration='PT8H',
        )

        SE_DEVOPS = sso.CfnPermissionSet(
            self,
            'SE_DEVOPS_PERMISSION_SET',
            name='SE_DEVOPS',
            description='Grants full-access to core CI/CD services. Intended for a DevOps person.',
            instance_arn=sso_instance_arn,
            customer_managed_policy_references=[
                {"name": "SE_DevOpsFullAccess"},
            ],
            managed_policies=[
                readonly_policy.managed_policy_arn,
                readbilling_policy.managed_policy_arn
            ],
            session_duration='PT8H',
        )
