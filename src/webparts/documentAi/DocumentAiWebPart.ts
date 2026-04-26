import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IReadonlyTheme } from '@microsoft/sp-component-base';

import * as strings from 'DocumentAiWebPartStrings';
import DocumentAi from './components/DocumentAi';
import { IDocumentAiProps } from './components/IDocumentAiProps';
import { AppStorageService } from '../../services/AppStorageService';
import { WebAgentService } from '../../services/WebAgentService';
import { PropertyPanePasswordInput } from '../controls/PropertyPanePassword/PropertyPanePasswordInput';
import { documentGuideText } from '../../data/DocumentGuideText';

export interface IDocumentAiWebPartProps {
  description: string;
  documentGuide: string;
  rejectedQuestionAnswer: string;
  aiAPIUrl: string;
  aiAPIKey: string;
}

export default class DocumentAiWebPart extends BaseClientSideWebPart<IDocumentAiWebPartProps> {

  public render(): void {
    WebAgentService.getInstance().setConfig({
      baseUrl: this.properties.aiAPIUrl,
      apiKey: this.properties.aiAPIKey,
      spfxContext: this.context
    });

    const element: React.ReactElement<IDocumentAiProps> = React.createElement(
      DocumentAi,
      {
        description: this.properties.description,
        documentGuide: this.properties.documentGuide,
        apiEndpoint: this.properties.aiAPIUrl,
        apiKey: this.properties.aiAPIKey,
        rejectedQuestionAnswer: this.properties.rejectedQuestionAnswer,
        hasTeamsContext: !!this.context.sdks.microsoftTeams
      }
    );

    ReactDom.render(element, this.domElement);
  }

  protected onInit(): Promise<void> {
    const storageService = AppStorageService.getInstance();
    storageService.apiEndpoint = this.properties.aiAPIUrl;
    storageService.apiKey = this.properties.aiAPIKey;
    WebAgentService.getInstance().setConfig({
      baseUrl: this.properties.aiAPIUrl,
      apiKey: this.properties.aiAPIKey,
      spfxContext: this.context
    });

    this.properties.documentGuide = this.properties.documentGuide.length > 0 ? this.properties.documentGuide : documentGuideText();
    return Promise.resolve();
  }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    if (!currentTheme) {
      return;
    }

    const {
      semanticColors
    } = currentTheme;

    if (semanticColors) {
      this.domElement.style.setProperty('--bodyText', semanticColors.bodyText || null);
      this.domElement.style.setProperty('--link', semanticColors.link || null);
      this.domElement.style.setProperty('--linkHovered', semanticColors.linkHovered || null);
    }

  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          // header: {
          //   description: strings.PropertyPaneDescription
          // },
          groups: [
            {
              // groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField('description', {
                  label: strings.DescriptionFieldLabel
                }),
                PropertyPaneTextField('rejectedQuestionAnswer', {
                  label: strings.RejectedQuestionAnswerFieldLabel
                }),
                PropertyPaneTextField('aiAPIUrl', {
                  label: strings.AIAPIUrlFieldLabel
                }),
                new PropertyPanePasswordInput('aiAPIKey', {
                  key: 'aiAPIKeyField',
                  label: strings.AIAPIKeyFieldLabel,
                  value: this.properties.aiAPIKey,
                  onChanged: (val: string) => {
                    this.properties.aiAPIKey = val;
                  }
                }),
                PropertyPaneTextField('documentGuide', {
                  label: strings.DocumentGuideFieldLabel,
                  multiline: true,
                  rows: 10,
                  // value: documentGuideText()
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
