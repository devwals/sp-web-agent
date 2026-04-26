declare interface IDocumentAiWebPartStrings {
  PropertyPaneDescription: string;
  BasicGroupName: string;
  DescriptionFieldLabel: string;
  DocumentGuideFieldLabel: string;
  RejectedQuestionAnswerFieldLabel: string;
  AIAPIUrlFieldLabel: string;
  AIAPIKeyFieldLabel: string;
  AppLocalEnvironmentSharePoint: string;
  AppLocalEnvironmentTeams: string;
  AppLocalEnvironmentOffice: string;
  AppLocalEnvironmentOutlook: string;
  AppSharePointEnvironment: string;
  AppTeamsTabEnvironment: string;
  AppOfficeEnvironment: string;
  AppOutlookEnvironment: string;
  UnknownEnvironment: string;
}

declare module 'DocumentAiWebPartStrings' {
  const strings: IDocumentAiWebPartStrings;
  export = strings;
}
