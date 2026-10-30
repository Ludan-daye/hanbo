export type RegionPickerProps = {
  readonly value: readonly string[];
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly onChange: (value: string[]) => void;
};
