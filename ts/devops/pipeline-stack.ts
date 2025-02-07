import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { Construct } from "constructs";

export class SEIamPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Look up for existing repository in the SE ROOT Account
    // REPLACE WITH GITHUB
    const repository = codecommit.Repository.fromRepositoryArn(
      this,
      "devops",
      `arn:aws:codecommit:DEFAULT_REGION:ROOT_ACCOUNT:se-iam-permissions`
    );

    // Define the CodeBuild project
    const project = new codebuild.PipelineProject(this, "CDKAppBuilder", {
      buildSpec: codebuild.BuildSpec.fromSourceFilename("buildspec.yml"),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_ARM_3,
        computeType: codebuild.ComputeType.SMALL,
      },
    });

    // Create permission to assume the file asset publishing role
    const codebuildPermissions = new iam.PolicyStatement({
      sid: "extraPermissionsRequiredForPublishingAssets",
      effect: iam.Effect.ALLOW,
      actions: ["sts:AssumeRole"],
      resources: [
        `arn:aws:iam::*:role/cdk-${cdk.DefaultStackSynthesizer.DEFAULT_QUALIFIER}-file-publishing-role-*-${this.region}`,
        `arn:aws:iam::*:role/cdk-${cdk.DefaultStackSynthesizer.DEFAULT_QUALIFIER}-image-publishing-role-*-${this.region}`,
        `arn:aws:iam::*:role/cdk-${cdk.DefaultStackSynthesizer.DEFAULT_QUALIFIER}-deploy-role-*-${this.region}`,
      ],
    });

    // Attach the permission to the role created with 'buildjob'
    project.addToRolePolicy(codebuildPermissions);
  }
}
