import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as workspaces from 'aws-cdk-lib/aws-workspaces';

export interface WorkspacesStackProps extends cdk.StackProps {
    userName: string; // ユーザー名を指定するためのプロパティ
    managedAdId: string; // Managed AD IDを指定するプロパティ
}

export class WorkspacesStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: WorkspacesStackProps) {
        super(scope, id, props);

        // WorkSpacesの作成
        const workspace = new workspaces.CfnWorkspace(this, 'User1Workspace', {
            bundleId: 'wsb-55rrhyyg1', // WorkSpacesのバンドルIDを指定
            directoryId: props.managedAdId, // Managed AD IDを使用
            userName: props.userName, // デプロイ時の引数で指定されたユーザー名を使用
            workspaceProperties: {
                runningMode: 'AUTO_STOP',
                runningModeAutoStopTimeoutInMinutes: 60, // 1時間で自動シャットダウン
                rootVolumeSizeGib: 80,
                userVolumeSizeGib: 50,
                computeTypeName: 'STANDARD' // インスタンスのタイプを指定
            }
        });
    }
}
