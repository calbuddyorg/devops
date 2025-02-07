#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import { softwareEngineering } from "../environments";
import { SEDevOpsResourcesStack } from "../devops/resources-stack";
import { SEIamPolicyStack } from "../devops/iam-stack";
import { SEPermissionSetStack } from "../devops/permission-sets-stack";
import { SEIamPipelineStack } from "../devops/pipeline-stack";

// Load environment variables from .env file
dotenv.config({ override: true });

const app = new cdk.App();

// region ROOT ACCOUNT —— DEVOPS MANAGEMENT
const seDevopsResourcesStack = new SEDevOpsResourcesStack(
  app,
  "SEDevOpsResourcesStack",
  {
    env: softwareEngineering["ROOT"],
    description:
      "This stack contains important resources for DevOps management in SE.",
    terminationProtection: true,
  }
);

// Create the pipeline stack in the ROOT account
const pipelineStack = new SEIamPipelineStack(app, "SEIamPipelineStack", {
  env: softwareEngineering["ROOT"],
  description: "This stack contains the CI/CD pipeline for IAM permissions.",
  terminationProtection: true,
});

// Create the SSO Permission Sets in the ROOT account
const ssoStack = new SEPermissionSetStack(app, "SEPermissionSetStack", {
  env: softwareEngineering["ROOT"],
  description: "This stack contains SSO Permission Sets for SE accounts.",
  terminationProtection: true,
  ssoInstanceArn: process.env.SSO_INSTANCE_ARN || "",
});

// region IAM POLICIES
Object.entries(softwareEngineering).forEach(
  ([environmentName, environment]) => {
    // Skip creation of IAM Policies in the Root account
    if (environmentName.toUpperCase() === "ROOT") return;

    // Definition of the IAM Policy Stack
    const policyStack = new SEIamPolicyStack(
      app,
      `SEIam${environmentName}Stack`,
      {
        env: environment,
        description: `This stack contains IAM policies for the SE ${environmentName} account.`,
        terminationProtection: true,
        secretArn: seDevopsResourcesStack.seSecret.secretArn,
      }
    );

    if (process.env.JOB_ROLE === "DevOps") {
      // Create the pipeline after IAM Policies
      pipelineStack.addDependency(policyStack);
      // Create the permission sets after IAM Policies
      ssoStack.addDependency(policyStack);
    }
  }
);

// region NETWORKING
/**
 * Definition of the networking stack. This lives in the SE account.
 * This stack contains Certificate, DNS Records, API Gateways, and other resources.
 * TODO: Implement networking stacks
 */

app.synth();
