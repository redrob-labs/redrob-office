import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { formatBytes } from '../../internal/datetime';
import { icons } from '../../icons';
import { IconButton } from '../IconButton/IconButton';

export interface UploadedFile {
  name: string;
  size?: number;
}

export interface FileUploadProps {
  title?: React.ReactNode;
  /** The second line: how else to get a file in. */
  hint?: React.ReactNode;
  /** Accept attribute, also printed as a line of guidance. */
  accept?: string;
  /** A size limit, in words. Printed beside `accept`. */
  maxLabel?: string;
  multiple?: boolean;
  invalid?: boolean;
  /** Files already chosen, listed under the drop zone. The consumer owns this list. */
  files?: UploadedFile[];
  onFiles?: (files: File[]) => void;
  /** Omit it and files cannot be removed - so only omit it when that is true. */
  onRemove?: (file: UploadedFile, index: number) => void;
  className?: string;
}

/**
 * Takes files, by drop or by browsing.
 *
 * Both routes, always. Drag and drop is not available to a keyboard user and is awkward on a phone, so
 * the label is tied to a real file input and browsing is never the hidden path.
 *
 * The chosen files are the consumer's state, not this component's: uploading is where retries,
 * progress and failures live, and a component that owned the list would have to own those too.
 */
export function FileUpload(props: FileUploadProps): React.ReactElement {
  const id = useStableId('rr-upload');
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const files = props.files || [];

  function emit(list: FileList | null): void {
    if (props.onFiles && list) props.onFiles(Array.prototype.slice.call(list));
  }

  return React.createElement('div', { className: cx('rr-upload', props.className) }, [
    React.createElement(
      'div',
      {
        key: 'zone',
        className: cx(
          'rr-upload__zone',
          over && 'rr-upload__zone--over',
          props.invalid && 'rr-upload__zone--invalid',
        ),
        onDragOver: (event: React.DragEvent) => {
          event.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (event: React.DragEvent) => {
          event.preventDefault();
          setOver(false);
          emit(event.dataTransfer.files);
        },
      },
      [
        React.createElement('input', {
          key: 'input',
          ref: inputRef,
          id,
          type: 'file',
          className: 'rr-upload__input',
          multiple: props.multiple,
          accept: props.accept,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => emit(event.target.files),
        }),
        React.createElement(
          'span',
          { key: 'i', className: 'rr-upload__icon' },
          icons.plus({ width: '100%', height: '100%' }),
        ),
        React.createElement(
          'label',
          { key: 't', className: 'rr-upload__title', htmlFor: id },
          props.title || 'Drop files here',
        ),
        React.createElement(
          'span',
          { key: 'h', className: 'rr-upload__hint' },
          props.hint || 'or browse from your computer',
        ),
        props.accept || props.maxLabel
          ? React.createElement(
              'span',
              { key: 'a', className: 'rr-upload__meta' },
              [props.accept, props.maxLabel].filter(Boolean).join(' · '),
            )
          : null,
      ],
    ),
    files.length
      ? React.createElement(
          'ul',
          { key: 'files', className: 'rr-upload__files' },
          files.map((file, i) =>
            React.createElement('li', { key: file.name + i, className: 'rr-upload__file' }, [
              React.createElement('span', { key: 'n', className: 'rr-upload__file-name' }, file.name),
              React.createElement('span', { key: 's', className: 'rr-upload__file-size' }, formatBytes(file.size)),
              props.onRemove
                ? React.createElement(
                    IconButton,
                    {
                      key: 'r',
                      label: `Remove ${file.name}`,
                      size: 'sm',
                      onClick: () => props.onRemove && props.onRemove(file, i),
                    },
                    icons.close({ width: '100%', height: '100%' }),
                  )
                : null,
            ]),
          ),
        )
      : null,
  ]);
}

export default FileUpload;
