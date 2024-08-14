import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

interface Ec2StackProps extends cdk.StackProps {
    workspaceIp: string;
    userName: string;
}

export class Ec2Stack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: Ec2StackProps) {
        super(scope, id, props);

        // スタック全体にタグを追加
        cdk.Tags.of(this).add('Name', props.userName);

        // ネームタグ 'ADVPC' でVPCを取得
        const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
            vpcName: 'ADVPC'
        });

        // セキュリティグループの作成
        const securityGroup = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
            vpc,
            allowAllOutbound: true,
        });

        // IPアドレスが指定されている場合のみ、セキュリティグループにルールを追加
        if (props?.workspaceIp) {
            securityGroup.addIngressRule(ec2.Peer.ipv4(props.workspaceIp + '/32'), ec2.Port.tcp(22), 'Allow SSH from WorkSpace IP');
        }

        // IAMロールの作成
        const role = new iam.Role(this, 'EC2InstanceRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ReadOnlyAccess')
            ],
        });

        // パスワード認証用のユーザーデータスクリプト
        const userDataScript = ec2.UserData.forLinux();
        userDataScript.addCommands(
            'sudo sed -i "s/PasswordAuthentication no/PasswordAuthentication yes/" /etc/ssh/sshd_config',
            'echo "ec2-user:SuperSecretPassword123!" | sudo chpasswd',
            'sudo systemctl restart sshd'
        );

        // EC2インスタンスの作成
        const instance1 = new ec2.Instance(this, 'EC2Instance1', {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
            machineImage: ec2.MachineImage.latestAmazonLinux2023(),
            securityGroup,
            role,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            userData: userDataScript
        });

        const instance2 = new ec2.Instance(this, 'EC2Instance2', {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
            machineImage: ec2.MachineImage.latestAmazonLinux2023(),
            securityGroup,
            role,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            userData: userDataScript
        });

        // 個々のインスタンスに対してもタグを追加
        cdk.Tags.of(instance1).add('Name', `${props.userName}-Instance1`);
        cdk.Tags.of(instance2).add('Name', `${props.userName}-Instance2`);

        // プライベートDNS名の出力
        const privateDnsName1 = instance1.instancePrivateDnsName;
        const privateDnsName2 = instance2.instancePrivateDnsName;
        new cdk.CfnOutput(this, 'EC2Instance1PrivateDnsName', { value: privateDnsName1 });
        new cdk.CfnOutput(this, 'EC2Instance2PrivateDnsName', { value: privateDnsName2 });
    }
}
