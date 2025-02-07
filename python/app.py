#!/usr/bin/env python3
import os
import environments
import aws_cdk as cdk

from dotenv import load_dotenv

# Load environment variables from .env file
# Done only once, at the beginning of the CDK Project, 
# and reflected across all stacks.
load_dotenv(override=True)

from devops.resources_stack import (
    # Classes relevant to AWS OUs Deparments
    SEDevOpsResourcesStack,
)
from devops.iam_stack import (
    # Classes relevant to AWS OUs Deparments
    SEIamPolicyStack,
)
from devops.permission_sets_stack import (
    # Classes relevant to AWS OUs Deparments
    SEPermissionSetStack,
)
from devops.pipeline_stack import (
    # Classes relevant to AWS OUs Deparments
    SEIamPipelineStack,
)
from networking.networking_stack import (
    # Classes relevant to AWS OUs Deparments
    SERootNetworkingStack,
    SENetworkingStack,
)

app = cdk.App()

# region ROOT ACCOUNT —— DEVOPS MANAGEMENT
'''
    The reason this distinction exists is to allow developers from any departement to interact with
    the repository that manages AWS permissions in the organization, so that both parties have visibility. 
    In a nutshell, this allow members of a given OU to edit any organization-level changes and also allows the
    Organization Admin (DevOps/IT) to edit the permissions of the entire organization.

    The DevOps team is responsible for managing the AWS permissions in the organization, and the SE team is
    responsible of managing their SE permissions in the OU.
'''
if os.environ['JOB_ROLE'] == 'DevOps':
    # region PIPELINE
    """
        Definition of the CI/CD Pipeline to maintain permissions with the SE OU. 
        This lives in the SE account.
    """
    pipeline_stack = SEIamPipelineStack(
        app,
        "SEIamPipelineStack",
        env=environments.software_engineering['ROOT'],
        stack_name="SEIamPipelineStack",
        description="This stack contains the CI/CD pipeline definition to provision IAM policies across SE OUs",
        # This stack cannot be deleted by the CDK CLI or CloudFormation, but can be deleted manually.
        termination_protection=True,
    )
    # endregion

    # region PERMISSION SETS
    """
        Definition of the permission sets. This lives in the ROOT account.
    """
    sso_stack = SEPermissionSetStack(
        app,
        "SEIamSsoPermissionSetStack",
        env=cdk.Environment(
            account=environments.software_engineering['ROOT'].account, 
            region=os.environ['SSO_REGION']
        ),
        stack_name="SEIamSsoPermissionSetStack",
        description="This stack contains the permission sets to provision IAM policies across OUs",
        # This stack cannot be deleted by the CDK CLI or CloudFormation, but can be deleted manually.
        termination_protection=True,
        sso_instance_arn=os.getenv('SSO_INSTANCE_ARN')
    )

    # Create the pipeline after permission sets
    pipeline_stack.add_dependency(sso_stack)
# endregion

# endregion

# region SOFTWARE ENGINEERING ACCOUNTS —— DEVOPS MANAGEMENT

# region RESOURCES
'''
    Definition of the resources needed to begin DevOps in SE accounts.
    This lives in the SE account. This stack contains resources such as
    a custom KMS key to encrypt/decrypt cross-account resources and a 
    secret to store general configurations.
'''
se_devops_resources_stack = SEDevOpsResourcesStack(
    app,
    "SEDevOpsResourcesStack",
    env=environments.software_engineering['ROOT'],
    stack_name="SEDevOpsResourcesStack",
    description="This stack contains important resources for DevOps management in SE.",
    # This stack cannot be deleted by the CDK CLI or CloudFormation, but can be deleted manually.
    termination_protection=True,
)
# endregion

# region IAM POLICIES
'''
    Definition of IAM policies in SE accounts that are consumed by the 
    SSO Permission Sets in the ROOT account. This lives in the SE account.
'''
for environment_name in environments.software_engineering:

    # Skip creation of IAM Policies in the Root account
    # Remove this if the SE team will need to work on the Root account
    if "ROOT" in environment_name.upper():
        continue

    # Definition of the IAM Policy Stack
    policy_stack = SEIamPolicyStack(
        app,
        # Format: SEIam<account_name>Stack
        f'SEIam{environment_name.capitalize()}Stack',
        env=environments.software_engineering[environment_name],
        stack_name=f'SEIam{environment_name.capitalize()}Stack',
        # Format: This stack contains IAM policies for the SE <account_name> account.
        description=f"This stack contains IAM policies for the SE {environment_name.capitalize()} account.",
        # This stack cannot be deleted by the CDK CLI or CloudFormation, but can be deleted manually.
        termination_protection=True,
        secret_arn=se_devops_resources_stack.se_secret.secret_arn,
    )

    if os.environ['JOB_ROLE'] == 'DevOps':
        # Create the pipeline after IAM Policies
        pipeline_stack.add_dependency(policy_stack)

        # Create the permission sets after IAM Policies
        sso_stack.add_dependency(policy_stack)
# endregion

# region NETWORKING
'''
    Definition of the networking stack. This lives in the SE account.
    This stack contains Certificate, DNS Records, API Gateways, and other resources.
'''

se_root_networking_stack = SERootNetworkingStack(
    app,
    "SERootNetworkingStack",
    env=environments.software_engineering['ROOT'],
    stack_name="SENetworkingStack",
    description="This stack contains important networking resources for SE accounts.",
    # This stack cannot be deleted by the CDK CLI or CloudFormation, but can be deleted manually.
    termination_protection=True,
    services_domain=os.environ['SE_SERVICES_DOMAIN'],
)

for env_name, environment in environments.software_engineering.items():
    # Skip creation of networking stacks in ROOT accounts
    if env_name in ["ROOT"]:
        continue
    se_networking_stack = SENetworkingStack(
        app,
        f"SE{env_name}NetworkingStack",
        env=environment,
        stack_name=f"SENetworkingStack",
        description=f"This stack contains important networking resources for SE {env_name} account.",
        # This stack cannot be deleted by the CDK CLI or CloudFormation, but can be deleted manually.
        termination_protection=True,
        services_domain=os.environ['SE_SERVICES_DOMAIN'],
    )

# endregion

# endregion

app.synth()
