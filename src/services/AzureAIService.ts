import { Message } from "../@types/common";
import { AppStorageService } from "./AppStorageService";

async function sendMessageToAzureAI(messages: Message[]): Promise<Response> {
    return fetch(AppStorageService.getInstance().apiEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": AppStorageService.getInstance().apiKey
        },
        body: JSON.stringify({
            messages: messages.map(({ role, content }) => ({ role, content }))
            // temperature: 0.7
        })
    });
}

export {
    sendMessageToAzureAI
};
