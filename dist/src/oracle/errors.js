import { APIConnectionError, APIConnectionTimeoutError, APIUserAbortError, } from 'openai';
import { formatElapsed } from './format.js';
export class OracleUserError extends Error {
    category;
    details;
    constructor(category, message, details, cause) {
        super(message);
        this.name = 'OracleUserError';
        this.category = category;
        this.details = details;
        if (cause) {
            this.cause = cause;
        }
    }
}
export class FileValidationError extends OracleUserError {
    constructor(message, details, cause) {
        super('file-validation', message, details, cause);
        this.name = 'FileValidationError';
    }
}
export class BrowserAutomationError extends OracleUserError {
    constructor(message, details, cause) {
        super('browser-automation', message, details, cause);
        this.name = 'BrowserAutomationError';
    }
}
export class PromptValidationError extends OracleUserError {
    constructor(message, details, cause) {
        super('prompt-validation', message, details, cause);
        this.name = 'PromptValidationError';
    }
}
export function asOracleUserError(error) {
    if (error instanceof OracleUserError) {
        return error;
    }
    return null;
}
export class OracleTransportError extends Error {
    reason;
    constructor(reason, message, cause) {
        super(message);
        this.name = 'OracleTransportError';
        this.reason = reason;
        if (cause) {
            this.cause = cause;
        }
    }
}
export class OracleResponseError extends Error {
    metadata;
    response;
    constructor(message, response) {
        super(message);
        this.name = 'OracleResponseError';
        this.response = response;
        this.metadata = extractResponseMetadata(response);
    }
}
export function extractResponseMetadata(response) {
    if (!response) {
        return {};
    }
    const metadata = {
        responseId: response.id,
        status: response.status,
        incompleteReason: response.incomplete_details?.reason ?? undefined,
    };
    const requestId = response._request_id;
    if (requestId !== undefined) {
        metadata.requestId = requestId;
    }
    return metadata;
}
export function toTransportError(error) {
    if (error instanceof OracleTransportError) {
        return error;
    }
    if (error instanceof APIConnectionTimeoutError) {
        return new OracleTransportError('client-timeout', 'OpenAI request timed out before completion.', error);
    }
    if (error instanceof APIUserAbortError) {
        return new OracleTransportError('client-abort', 'The request was aborted before OpenAI finished responding.', error);
    }
    if (error instanceof APIConnectionError) {
        return new OracleTransportError('connection-lost', 'Connection to OpenAI dropped before the response completed.', error);
    }
    return new OracleTransportError('unknown', error instanceof Error ? error.message : 'Unknown transport failure.', error);
}
export function describeTransportError(error, deadlineMs) {
    switch (error.reason) {
        case 'client-timeout':
            return deadlineMs
                ? `Client-side timeout: OpenAI streaming call exceeded the ${formatElapsed(deadlineMs)} deadline.`
                : 'Client-side timeout: OpenAI streaming call exceeded the configured deadline.';
        case 'connection-lost':
            return 'Connection to OpenAI ended unexpectedly before the response completed.';
        case 'client-abort':
            return 'Request was aborted before OpenAI completed the response.';
        default:
            return 'OpenAI streaming call ended with an unknown transport error.';
    }
}
