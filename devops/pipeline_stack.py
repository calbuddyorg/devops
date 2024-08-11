from aws_cdk import (
    Stack,
    DefaultStackSynthesizer,
    aws_iam as iam,
    aws_codebuild as codebuild,
    aws_codecommit as codecommit,
    aws_codepipeline as codepipeline,
    aws_codepipeline_actions as codepipeline_actions,
    aws_sns as sns,
)
from constructs import Construct

class SEIamPipelineStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Look up for existing repository in the SE ROOT Account
        # REPLACE WITH GITHUB
        repository = codecommit.Repository.from_repository_arn(
            self,
            "devops",
            repository_arn=f"arn:aws:codecommit:DEFAULT_REGION:ROOT_ACCOUNT:se-iam-permissions"
        )

        # Define the CodeBuild project
        project = codebuild.PipelineProject(
            self,
            "CDKAppBuilder",
            build_spec=codebuild.BuildSpec.from_source_filename("buildspec.yml"),
            environment=codebuild.BuildEnvironment(
                build_image=codebuild.LinuxBuildImage.AMAZON_LINUX_2_ARM_3,
                compute_type=codebuild.ComputeType.SMALL,
            ),
        )

        # Create permission to assume the file asset publishing role
        codebuild_permissions = iam.PolicyStatement(
            sid="extraPermissionsRequiredForPublishingAssets",
            effect=iam.Effect.ALLOW,
            actions=["sts:AssumeRole"],
            resources=[
                f"arn:aws:iam::*:role/cdk-{DefaultStackSynthesizer.DEFAULT_QUALIFIER}-file-publishing-role-*-{self.region}",
                f"arn:aws:iam::*:role/cdk-{DefaultStackSynthesizer.DEFAULT_QUALIFIER}-image-publishing-role-*-{self.region}",
                f"arn:aws:iam::*:role/cdk-{DefaultStackSynthesizer.DEFAULT_QUALIFIER}-deploy-role-*-{self.region}",
            ]
        )

        # Attach the permission to the role created with 'buildjob'
        project.add_to_role_policy(codebuild_permissions)

        # Create a CodePipeline
        pipeline = codepipeline.Pipeline(
            self, 
            'SEIamPipeline',
            pipeline_name='SEIamPipeline',
        )

        # Create S3 artifact for source code
        source_output = codepipeline.Artifact("SE_IAMSourceOutput")

        # Stage 1: Source Stage
        source_action = codepipeline_actions.CodeCommitSourceAction(
            action_name="CodeCommit",
            repository=repository,
            output=source_output,
            branch="release",
        )
        pipeline.add_stage(
            stage_name="Source", 
            actions=[source_action]
        )

        # Stage 2: Email Notification

        email_topic = sns.Topic(
            self, "IamPipelineEmailTopic",
            display_name="SE IAM Pipeline Notification Topic",
            topic_name='IamPipelineEmailTopic'
        )

        # Stage 3: Manual Approvals
        manual_approval_action = codepipeline_actions.ManualApprovalAction(
            action_name=f"ManualApproval1",
            additional_information="There are new IAM Policy changes from the SE team. Please review.",
            notification_topic=email_topic,
        )
        pipeline.add_stage(stage_name="ManualApproval1", actions=[manual_approval_action])

        manual_approval_action = codepipeline_actions.ManualApprovalAction(
            action_name=f"ManualApproval2",
            additional_information="There are new IAM Policy changes from the SE team. Please review.",
            notification_topic=None,
        )
        pipeline.add_stage(stage_name="ManualApproval2", actions=[manual_approval_action])

        # Stage 4: Build Stage
        build_output = codepipeline.Artifact("SE_IAMBuildOutput")
        build_action = codepipeline_actions.CodeBuildAction(
            action_name="CodeBuild",
            project=project,
            input=source_output,
            outputs=[build_output],
        )
        pipeline.add_stage(
            stage_name="Build",
            actions=[build_action],
        )
