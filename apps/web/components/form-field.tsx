import type {ComponentProps} from 'react';

import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

interface FormFieldProps extends ComponentProps<'input'> {
  name: string;
  label: string;
  /** Message shown under the input when its value is not valid. */
  error?: string;
}

/** A labelled text input with room for an error message underneath. */
export function FormField({name, label, error, ...inputProps}: FormFieldProps) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-11"
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
