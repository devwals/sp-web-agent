import * as React from 'react';
import styles from './DocumentAi.module.scss';
import type { IDocumentAiProps } from './IDocumentAiProps';
import { escape } from '@microsoft/sp-lodash-subset';
import ErrorBoundary from '../../../errorBoundary';
import WebPartWrapper from './WebPartWrapper/WebPartWrapper';

export default class DocumentAi extends React.Component<IDocumentAiProps> {
  public render(): React.ReactElement<IDocumentAiProps> {
    const {
      description,
      documentGuide,
      apiEndpoint,
      apiKey,
      rejectedQuestionAnswer,
      hasTeamsContext
    } = this.props;

    const normalizedEndpoint = (apiEndpoint || "").trim().toLowerCase();
    const normalizedApiKey = (apiKey || "").trim().toLowerCase();
    const hasValidEndpoint = normalizedEndpoint.indexOf("https") >= 0 &&
      normalizedEndpoint.indexOf("azure openai api endpoint") < 0;
    const hasValidApiKey = normalizedApiKey.length > 0 &&
      normalizedApiKey.indexOf("azure openai api key") < 0;
    const isConfigured = hasValidEndpoint && hasValidApiKey;

    return (
      <ErrorBoundary>
        <section className={`${styles.documentAi} ${hasTeamsContext ? styles.teams : ''}`}>
          {
            description.trim().length > 0 ? (
              <div className={styles.welcome}>
                <h2>
                  <span>📤</span> {escape(description)}
                </h2>
              </div>
            ) : null
          }

          {isConfigured ? (
            <WebPartWrapper documentGuide={documentGuide} rejectedQuestionAnswer={rejectedQuestionAnswer} />
          ) : (
            <div className={styles.setupMessage}>
              <h3>Setup required before using this web part</h3>
              <p>
                To get started, edit this page and open this web part&apos;s properties.
                Then provide both values below:
              </p>
              <ul>
                <li><strong>AI API Endpoint</strong> (must contain <code>https</code>)</li>
                <li><strong>AI API Key</strong></li>
              </ul>
              <p>
                Steps: <strong>Edit page</strong> - <strong>Select web part</strong> - <strong>Open properties</strong> - <strong>Save/Republish</strong>.
              </p>
              <p>
                if you need any help, please contact support at{' '}
                <a href="mailto:apps@devwals.com">apps@devwals.com</a>.
              </p>
            </div>
          )}
        </section>
      </ErrorBoundary>
    );
  }
}
