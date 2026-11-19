export type RegionPickerProps = {
  readonly value: readonly string[];
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly onChange: (value: string[]) => void;
  /** 这一行左边的名称，默认“所在地区”。 */
  readonly label?: string;
  readonly required?: boolean;
};
