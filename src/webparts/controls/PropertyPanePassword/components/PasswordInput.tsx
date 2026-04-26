import * as React from 'react';
import { IPasswordInputProps } from './IPasswordInputProps';
import { TextField } from '@fluentui/react';

interface IPasswordInputState {
    internalValue: string;
}

export default class PasswordInput extends React.Component<IPasswordInputProps, IPasswordInputState> {
    constructor(props: IPasswordInputProps) {
        super(props);

        this.state = {
            internalValue: props.value || ''
        };
    }

    public render(): JSX.Element {
        return (
            <div>
                <TextField
                    label={this.props.label}
                    type="password"
                    value={this.state.internalValue}
                    onChange={(_, newValue) => {
                        const updatedValue = newValue || '';
                        this.setState({ internalValue: updatedValue });
                        this.props.onChanged(updatedValue);
                    }}
                    styles={{
                        root: { marginTop: 4 }
                    }}
                />
            </div>
        );
    }
}