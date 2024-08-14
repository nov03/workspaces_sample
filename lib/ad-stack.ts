import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as directoryservice from 'aws-cdk-lib/aws-directoryservice';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Tags } from 'aws-cdk-lib';

export class AdtStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // VPCの作成
        const vpc = new ec2.Vpc(this, 'AdtVpc', {
            maxAzs: 2,
            natGateways: 1,
        });

        // VPCにネームタグを追加
        Tags.of(vpc).add('Name', 'ADVPC');

        // マネージドADの作成
        const managedAd = new directoryservice.CfnMicrosoftAD(this, 'ManagedAd', {
            name: 'example.com',
            password: 'SuperSecretPassword123!',
            vpcSettings: {
                vpcId: vpc.vpcId,
                subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
            },
            edition: 'Standard',
        });

        // パラメータストアにManaged ADのIDを保存
        new ssm.StringParameter(this, 'ManagedAdIdParameter', {
            parameterName: '/managedAd/id',
            stringValue: managedAd.ref,
        });

        // 出力
        new cdk.CfnOutput(this, 'AdtVpcId', {
            value: vpc.vpcId,
            description: 'VPC ID of the created VPC',
            exportName: 'AdtVpcId'
        });
        new cdk.CfnOutput(this, 'AdtManagedAdId', {
            value: managedAd.ref,
            description: 'ID of the created Managed AD',
            exportName: 'AdtManagedAdId'
        });
    }
}
