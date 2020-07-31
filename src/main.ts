import * as core from '@actions/core';
import * as crypto from "crypto";

import { AuthorizerFactory } from "azure-actions-webclient/AuthorizerFactory";
import { IAuthorizer } from "azure-actions-webclient/Authorizer/IAuthorizer";
import { TokenCredentials, ServiceClientCredentials } from "@azure/ms-rest-js";

import { TaskParameters } from "./taskparameters";
import { ContainerInstanceManagementClient, ContainerInstanceManagementModels } from '@azure/arm-containerinstance';

var prefix = !!process.env.AZURE_HTTP_USER_AGENT ? `${process.env.AZURE_HTTP_USER_AGENT}` : "";

async function main() {

    try {
        // Set user agent variable
        let usrAgentRepo = crypto.createHash('sha256').update(`${process.env.GITHUB_REPOSITORY}`).digest('hex');
        let actionName = 'DeployAzureContainerInstance';
        let userAgentString = (!!prefix ? `${prefix}+` : '') + `GITHUBACTIONS_${actionName}_${usrAgentRepo}`;
        core.exportVariable('AZURE_HTTP_USER_AGENT', userAgentString);

        let endpoint: IAuthorizer = await AuthorizerFactory.getAuthorizer();
        var taskParams = TaskParameters.getTaskParams(endpoint);
        let bearerToken = await endpoint.getToken();
        let creds: ServiceClientCredentials = new TokenCredentials(bearerToken);

        core.debug("Predeployment Steps Started");
        const client = new ContainerInstanceManagementClient(creds, taskParams.subscriptionId);

        core.debug("Deployment Step Started");
        let containerGroupInstance: ContainerInstanceManagementModels.ContainerGroup = {
            "location": taskParams.location,
            "containers": taskParams.containers,
            "imageRegistryCredentials": taskParams.registryUsername ? [ { "server": taskParams.registryLoginServer, "username": taskParams.registryUsername, "password": taskParams.registryPassword } ] : [],
            "ipAddress": {
                "ports": getGroupPorts(taskParams),
                "type": taskParams.ipAddress,
                "dnsNameLabel": taskParams.dnsNameLabel
            },
            "networkProfile": taskParams.networkProfile,
            "diagnostics": taskParams.diagnostics,
            "volumes": taskParams.volumes,
            "osType": taskParams.osType,
            "restartPolicy": taskParams.restartPolicy,
            "type": "Microsoft.ContainerInstance/containerGroups",
            "name": taskParams.groupName
        }
        let containerDeploymentResult = await client.containerGroups.createOrUpdate(taskParams.resourceGroup, taskParams.groupName, containerGroupInstance);
        if(containerDeploymentResult.provisioningState == "Succeeded") {
            console.log("Deployment Succeeded.");
        } else {
            core.debug("Deployment Result: "+containerDeploymentResult);
            throw Error("Container Deployment Failed"+containerDeploymentResult);
        }
    }
    catch (error) {
        core.debug("Deployment Failed with Error: " + error);
        core.setFailed(error);
    }
    finally{
        // Reset AZURE_HTTP_USER_AGENT
        core.exportVariable('AZURE_HTTP_USER_AGENT', prefix);
    }
}

function getGroupPorts(taskParams: TaskParameters): Array<ContainerInstanceManagementModels.Port> {
    return taskParams.containers.reduce((portsList, nextContainer) => { 
        if (!!nextContainer.ports) {
            const containerPortList = nextContainer.ports.map(containerPort => ({...containerPort} as ContainerInstanceManagementModels.Port));
            portsList.push(...containerPortList);
        }
        return portsList; 
    }, [] as Array<ContainerInstanceManagementModels.Port>);
}

main();
