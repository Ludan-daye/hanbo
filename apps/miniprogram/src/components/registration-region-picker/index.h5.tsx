import { Picker, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { areaList } from "@vant/area-data";
import type { RegionPickerProps } from "./types";

type Area = { readonly code: string; readonly name: string };
type Indices = readonly [number, number, number];
type Columns = readonly [readonly Area[], readonly Area[], readonly Area[]];
const entries = (values: Readonly<Record<string, string>>): readonly Area[] =>
  Object.entries(values).map(([code, name]) => ({ code, name }));
const provinces: readonly Area[] = entries(areaList.province_list);
const cities: readonly Area[] = entries(areaList.city_list);
const counties: readonly Area[] = entries(areaList.county_list);
const columnsAt = (indices: Indices): Columns => {
  const province: Area = provinces[indices[0]];
  const cityOptions: readonly Area[] = cities.filter((area) =>
    area.code.startsWith(province.code.slice(0, 2)),
  );
  const city: Area = cityOptions[indices[1]];
  return [
    provinces,
    cityOptions,
    counties.filter((area) => area.code.startsWith(city.code.slice(0, 4))),
  ];
};
const selectedIndices = (value: readonly string[]): Indices => {
  const province: number = Math.max(
    0,
    provinces.findIndex((area) => area.name === value[0]),
  );
  const city: number = Math.max(
    0,
    columnsAt([province, 0, 0])[1].findIndex((area) => area.name === value[1]),
  );
  const county: number = Math.max(
    0,
    columnsAt([province, city, 0])[2].findIndex(
      (area) => area.name === value[2],
    ),
  );
  return [province, city, county];
};

/** H5's Stencil picker has no native region data; provide a local cascading list. */
export function RegistrationRegionPicker({
  value,
  disabled,
  invalid,
  onChange,
}: RegionPickerProps): JSX.Element {
  const [indices, setIndices] = useState<Indices>(() => selectedIndices(value));
  useEffect(() => setIndices(selectedIndices(value)), [value]);
  const columns: Columns = columnsAt(indices);
  return (
    <Picker
      mode="multiSelector"
      range={columns.map((column) => column.map((area) => area.name))}
      value={[...indices]}
      disabled={disabled}
      onColumnChange={(event) => {
        const { column, value: index } = event.detail;
        setIndices((current) =>
          column === 0
            ? [index, 0, 0]
            : column === 1
              ? [current[0], index, 0]
              : [current[0], current[1], index],
        );
      }}
      onCancel={() => setIndices(selectedIndices(value))}
      onChange={(event) => {
        const selected: Indices = [
          event.detail.value[0],
          event.detail.value[1],
          event.detail.value[2],
        ];
        const options: Columns = columnsAt(selected);
        onChange(options.map((column, index) => column[selected[index]].name));
      }}
    >
      <View
        className={`registration-select ${invalid ? "registration-input--error" : ""}`}
      >
        <View className={value.length ? "" : "registration-placeholder"}>
          {value.length ? value.join(" / ") : "请选择省 / 市 / 区"}
        </View>
        <View className="registration-chevron">›</View>
      </View>
    </Picker>
  );
}
