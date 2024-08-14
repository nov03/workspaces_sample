#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AdtStack } from '../lib/ad-stack';
import { WorkspacesStack } from '../lib/workspaces-stack';
import { ApiGatewayAndCodeBuildStack } from '../lib/api-gateway-codebuild-stack';
import { Ec2Stack } from '../lib/ec2-stack';

const app = new cdk.App();

new AdtStack(app, 'AdtStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

// SSMパラメータからManaged ADのIDを取得
const managedAdId = app.node.tryGetContext('managedAdId') || 'dummyManagedAdId';

// ユーザー名をコンテキストから取得、指定がなければデフォルトのユーザー名を使用
const userName = app.node.tryGetContext('userName') || 'defaultDummyUser';

// ユーザー名のドットをハイフンに置換して`stackUserName`を作成
const stackUserName = userName.replace(/\./g, '-');

// ワークスペーススタックの作成
new WorkspacesStack(app, `WorkspacesStack-${stackUserName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  managedAdId: managedAdId, // SSMパラメータから取得したManaged ADのIDを使用
  userName: userName, // ユーザー名を指定、コンテキスト引数がない場合はダミーのユーザー名を使用
});

// EC2スタックの作成
new Ec2Stack(app, `Ec2Stack-${stackUserName}`, {  // ユーザー名を含めたスタック名を使用
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  workspaceIp: app.node.tryGetContext('workspaceIp') || '0.0.0.0',  // 必要に応じて変更
  userName: userName,  // ユーザー名を渡す
});

// API GatewayとCodeBuildスタックの作成
new ApiGatewayAndCodeBuildStack(app, 'ApiGatewayAndCodeBuildStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
