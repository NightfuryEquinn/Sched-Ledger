import { HexColorInput, HexColorPicker } from "react-colorful";

type CategoryColorPickerProps = {
  value: string;
  onChange: (hex: string) => void;
};

/** Category color picker with a visual swatch, hex input, and live preview. */
export function CategoryColorPicker({ value, onChange }: CategoryColorPickerProps) {
  return (
    <div className="cat-color-row">
      <HexColorPicker className="cat-color-picker" color={value} onChange={onChange} />
      <div className="cat-color-hex-row">
        <HexColorInput
          className="text-in wallet-field cat-color-hex"
          color={value}
          onChange={onChange}
          prefixed
          aria-label="Category color hex"
        />
        <span className="cat-color-preview" style={{ background: value }} aria-hidden />
      </div>
    </div>
  );
}
