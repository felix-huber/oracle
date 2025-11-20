import chalk from 'chalk';
import { formatElapsed } from '../oracle.js';
import { runBrowserMode } from '../browserMode.js';
import { assembleBrowserPrompt } from './prompt.js';
import { BrowserAutomationError } from '../oracle/errors.js';
export async function runBrowserSessionExecution({ runOptions, browserConfig, cwd, log, cliVersion }, deps = {}) {
    if (runOptions.model.startsWith('gemini')) {
        throw new BrowserAutomationError('Gemini models are not available in browser mode. Re-run with --engine api.', {
            stage: 'preflight',
        });
    }
    const assemblePrompt = deps.assemblePrompt ?? assembleBrowserPrompt;
    const executeBrowser = deps.executeBrowser ?? runBrowserMode;
    const promptArtifacts = await assemblePrompt(runOptions, { cwd });
    if (runOptions.verbose) {
        log(chalk.dim(`[verbose] Browser config: ${JSON.stringify({
            ...browserConfig,
        })}`));
        log(chalk.dim(`[verbose] Browser prompt length: ${promptArtifacts.composerText.length} chars`));
        if (promptArtifacts.attachments.length > 0) {
            const attachmentList = promptArtifacts.attachments.map((attachment) => attachment.displayPath).join(', ');
            log(chalk.dim(`[verbose] Browser attachments: ${attachmentList}`));
            if (promptArtifacts.bundled) {
                log(chalk.yellow(`[browser] Bundled ${promptArtifacts.bundled.originalCount} files into ${promptArtifacts.bundled.bundlePath}.`));
            }
        }
        else if (runOptions.file && runOptions.file.length > 0 && runOptions.browserInlineFiles) {
            log(chalk.dim('[verbose] Browser inline file fallback enabled (pasting file contents).'));
        }
    }
    const headerLine = `oracle (${cliVersion}) launching browser mode (${runOptions.model}) with ~${promptArtifacts.estimatedInputTokens.toLocaleString()} tokens`;
    if (promptArtifacts.bundled) {
        log(chalk.yellow(`[browser] Packed ${promptArtifacts.bundled.originalCount} files into ${promptArtifacts.bundled.bundlePath}. If automation fails, you can drag this file into ChatGPT manually.`));
    }
    const automationLogger = ((message) => {
        if (typeof message === 'string') {
            log(message);
        }
    });
    automationLogger.verbose = Boolean(runOptions.verbose);
    automationLogger.sessionLog = log;
    log(headerLine);
    log(chalk.dim('Chrome automation does not stream output; this may take a minute...'));
    let browserResult;
    try {
        browserResult = await executeBrowser({
            prompt: promptArtifacts.composerText,
            attachments: promptArtifacts.attachments,
            config: browserConfig,
            log: automationLogger,
            heartbeatIntervalMs: runOptions.heartbeatIntervalMs,
            verbose: runOptions.verbose,
        });
    }
    catch (error) {
        if (error instanceof BrowserAutomationError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : 'Browser automation failed.';
        throw new BrowserAutomationError(message, { stage: 'execute-browser' }, error);
    }
    if (!runOptions.silent) {
        log(chalk.bold('Answer:'));
        log(browserResult.answerMarkdown || browserResult.answerText || chalk.dim('(no text output)'));
        log('');
    }
    const answerText = browserResult.answerMarkdown || browserResult.answerText || '';
    const usage = {
        inputTokens: promptArtifacts.estimatedInputTokens,
        outputTokens: browserResult.answerTokens,
        reasoningTokens: 0,
        totalTokens: promptArtifacts.estimatedInputTokens + browserResult.answerTokens,
    };
    const tokensDisplay = `${usage.inputTokens}/${usage.outputTokens}/${usage.reasoningTokens}/${usage.totalTokens}`;
    const tokensLabel = runOptions.verbose ? 'tokens (input/output/reasoning/total)' : 'tok(i/o/r/t)';
    const statsParts = [`${runOptions.model}[browser]`, `${tokensLabel}=${tokensDisplay}`];
    if (runOptions.file && runOptions.file.length > 0) {
        statsParts.push(`files=${runOptions.file.length}`);
    }
    log(chalk.blue(`Finished in ${formatElapsed(browserResult.tookMs)} (${statsParts.join(' | ')})`));
    return {
        usage,
        elapsedMs: browserResult.tookMs,
        runtime: {
            chromePid: browserResult.chromePid,
            chromePort: browserResult.chromePort,
            userDataDir: browserResult.userDataDir,
        },
        answerText,
    };
}
