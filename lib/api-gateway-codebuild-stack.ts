import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as iam from 'aws-cdk-lib/aws-iam';

export class ApiGatewayAndCodeBuildStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

        // CodeCommitリポジトリの作成
        const repository = new codecommit.Repository(this, 'Ec2StackRepository', {
            repositoryName: 'ec2-stack-repo',
            description: 'Repository for EC2 stack CDK project',
        });

        // CodeBuildの実行ロールを作成し、AdministratorAccessを付与
        const codeBuildRole = new iam.Role(this, 'CodeBuildProjectRole', {
            assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'), // AdministratorAccessを付与
            ],
        });

        // EC2Stack用のCodeBuildプロジェクトの作成
        const codeBuildProject = new codebuild.Project(this, 'CDKDeployProject', {
            role: codeBuildRole,
            source: codebuild.Source.codeCommit({
                repository,
                branchOrRef: 'main',
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
                privileged: true,
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        runtime_versions: {
                            nodejs: 18
                        },
                        commands: [
                            'npm install -g aws-cdk',
                            'export PATH=$PATH:$(npm bin -g)',
                            'npm ci',
                            'npm install typescript ts-node @types/node',
                            'npm install aws-cdk-lib constructs'
                        ],
                    },
                    build: {
                        commands: [
                            'echo $USER_NAME',  // 確認のための出力
                            'managedAdId=$(aws ssm get-parameter --name /managedAd/id --query "Parameter.Value" --output text)',
                            'workspaceIp=$(aws workspaces describe-workspaces --directory-id $managedAdId --user-name $USER_NAME --query "Workspaces[0].IpAddress" --output text)',
                            `cdk deploy Ec2Stack-$(echo $USER_NAME | sed "s/\\./-/g") --require-approval never -c workspaceIp=$workspaceIp -c userName=$USER_NAME`
                        ],

                    },
                },
                env: {
                    variables: {
                        USER_NAME: "defaultDummyUser",
                    }
                }
            }),
        });

        // WorkspacesStack用のCodeBuildプロジェクトの作成
        const workspacesBuildProject = new codebuild.Project(this, 'WorkspacesDeployProject', {
            role: codeBuildRole,
            source: codebuild.Source.codeCommit({
                repository,
                branchOrRef: 'main',
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
                privileged: true,
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        runtime_versions: {
                            nodejs: 18
                        },
                        commands: [
                            'npm install -g aws-cdk',
                            'export PATH=$PATH:$(npm bin -g)',
                            'npm ci',
                            'npm install typescript ts-node @types/node',
                            'npm install aws-cdk-lib constructs'
                        ],
                    },
                    build: {
                        commands: [
                            'echo $USER_NAME',  // 確認のための出力
                            'managedAdId=$(aws ssm get-parameter --name /managedAd/id --query "Parameter.Value" --output text)',
                            'cdk deploy WorkspacesStack-$(echo $USER_NAME | sed "s/\\./-/g") --require-approval never -c userName=$USER_NAME -c managedAdId=$managedAdId'
                        ],
                    },
                },
                env: {
                    variables: {
                        USER_NAME: "defaultDummyUser",
                    }
                }
            }),
        });

        // API Gatewayの作成
        const api = new apigateway.RestApi(this, 'DeployApi', {
            restApiName: 'CDK Deploy API',
            description: 'This API deploys CDK stacks based on the provided stack name.',
        });

        const requestTemplate = `
        {
          "projectName": "${codeBuildProject.projectName}",
          "environmentVariablesOverride": [
            {
              "name": "USER_NAME",
              "value": "$input.path('$.userName')",
              "type": "PLAINTEXT"
            }
          ]
        }`;

        // API Gateway統合の作成
        const integration = new apigateway.AwsIntegration({
            service: 'codebuild',
            action: 'StartBuild',
            integrationHttpMethod: 'POST',
            options: {
                credentialsRole: new iam.Role(this, 'ApiGatewayCodeBuildRole', {
                    assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
                    managedPolicies: [
                        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAPIGatewayInvokeFullAccess'),
                        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeBuildDeveloperAccess'),
                    ],
                }),
                requestTemplates: {
                    'application/json': requestTemplate,
                },
                integrationResponses: [
                    {
                        statusCode: '200',
                    },
                ],
                requestParameters: {
                    'integration.request.header.Content-Type': "'application/x-amz-json-1.1'",
                    'integration.request.header.X-Amz-Target': "'CodeBuild_20161006.StartBuild'",
                },
            },
        });

        // 既存のPOSTメソッドの作成
        api.root.addMethod('POST', integration, {
            methodResponses: [
                {
                    statusCode: '200',
                },
            ],
        });

        // 新しいメソッド (workspacesdeploy) の追加
        const workspacesdeploy = api.root.addResource('workspacesdeploy');
        const workspacesRequestTemplate = `
        {
          "projectName": "${workspacesBuildProject.projectName}",
          "environmentVariablesOverride": [
            {
              "name": "USER_NAME",
              "value": "$input.path('$.userName')",
              "type": "PLAINTEXT"
            }
          ]
        }`;

        const workspacesIntegration = new apigateway.AwsIntegration({
            service: 'codebuild',
            action: 'StartBuild',
            integrationHttpMethod: 'POST',
            options: {
                credentialsRole: new iam.Role(this, 'WorkspacesApiGatewayCodeBuildRole', {
                    assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
                    managedPolicies: [
                        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAPIGatewayInvokeFullAccess'),
                        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeBuildDeveloperAccess'),
                    ],
                }),
                requestTemplates: {
                    'application/json': workspacesRequestTemplate,
                },
                integrationResponses: [
                    {
                        statusCode: '200',
                    },
                ],
                requestParameters: {
                    'integration.request.header.Content-Type': "'application/x-amz-json-1.1'",
                    'integration.request.header.X-Amz-Target': "'CodeBuild_20161006.StartBuild'",
                },
            },
        });

        workspacesdeploy.addMethod('POST', workspacesIntegration, {
            methodResponses: [
                {
                    statusCode: '200',
                },
            ],
        });
    }
}
