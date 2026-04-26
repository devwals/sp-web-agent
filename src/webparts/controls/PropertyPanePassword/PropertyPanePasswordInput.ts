import * as React from 'react';
import * as ReactDom from 'react-dom';
import { IPropertyPaneField, PropertyPaneFieldType } from "@microsoft/sp-property-pane";
import { IPropertyPanePasswordInputProps } from './IPropertyPanePasswordInputProps';
import { IPropertyPanePasswordInputInternalProps } from './IPropertyPanePasswordInputInternalProps';
import PasswordInput from './components/PasswordInput';
import { IPasswordInputProps } from './components/IPasswordInputProps';

export class PropertyPanePasswordInput implements IPropertyPaneField<IPropertyPanePasswordInputProps> {
  public type: PropertyPaneFieldType = PropertyPaneFieldType.Custom;
  public targetProperty: string;
  public properties: IPropertyPanePasswordInputInternalProps;
  private elem: HTMLElement;

  constructor(targetProperty: string, properties: IPropertyPanePasswordInputProps) {
   
    this.targetProperty = targetProperty;
    this.properties = {
      key: properties.key,
      label: properties.label,
      value: properties.value,
      onChanged: properties.onChanged,
      onRender: this.onRender.bind(this),
      onDispose: this.onDispose.bind(this)
    };
  }

  public render(): void {
    if (!this.elem) {
      return;
    }

    this.onRender(this.elem);
  }

  private onDispose(element: HTMLElement): void {
    ReactDom.unmountComponentAtNode(element);
  }

  private onRender(elem: HTMLElement): void {
    if (!this.elem) {
      this.elem = elem;
    }

    const element: React.ReactElement<IPasswordInputProps> = React.createElement(PasswordInput, {
      label: this.properties.label,
      value: this.properties.value,
      onChanged: this.onChanged.bind(this)
    });
    ReactDom.render(element, elem);
  }

  private onChanged(value: string): void {
    this.properties.onChanged(value);
  }
}