#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SmStack } from "../lib/sm-stack";

const app = new cdk.App();

const stage = app.node.tryGetContext("stage") || "dev";

new SmStack(app, `Sm-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "eu-west-1",
  },
  description: `SM Creator Intelligence Platform (${stage})`,
});
