#!/usr/bin/env python3
"""生成数字字体样式 src/styles/digits-font.scss。

界面上的大数字（时间、人数、分数）用 Barlow Condensed Bold。小程序的样式里不能引用
本地字体文件，所以只取数字和几个符号做成子集，以 base64 写进样式，不走网络。

用法（需要 fontTools）：
    python3 scripts/build-digits-font.py <BarlowCondensed-Bold.ttf>

字体来源：https://github.com/google/fonts/tree/main/ofl/barlowcondensed
许可：SIL Open Font License 1.1，见 src/assets/fonts/OFL.txt。原始字体文件不进仓库。
"""
import base64
import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

# 数字、时间和日期的分隔符、百分号、正负号（U+2212 是减号）、空格
CHARS = "0123456789:./-%+− "
LIMIT = 15 * 1024
OUT = Path(__file__).resolve().parent.parent / "src" / "styles" / "digits-font.scss"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    font = TTFont(sys.argv[1])
    options = subset.Options()
    options.layout_features = ["tnum"]  # 保留等宽数字，列表里的数字才能对齐
    options.hinting = False
    options.name_IDs = [1, 2]
    options.notdef_outline = True
    options.drop_tables += ["DSIG"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=CHARS)
    subsetter.subset(font)
    buffer = io.BytesIO()
    font.save(buffer)
    data = buffer.getvalue()
    if len(data) >= LIMIT:
        sys.exit(f"子集 {len(data)} 字节，超过 {LIMIT} 字节的上限")
    payload = base64.b64encode(data).decode("ascii")
    OUT.write_text(
        "// 由 scripts/build-digits-font.py 生成，不要手改。\n"
        "// Barlow Condensed Bold 的数字子集，SIL OFL 1.1，许可见 src/assets/fonts/OFL.txt。\n"
        "@font-face {\n"
        '  font-family: "HanboDigits";\n'
        "  font-weight: 700;\n"
        f'  src: url("data:font/ttf;charset=utf-8;base64,{payload}")\n'
        '    format("truetype");\n'
        "}\n",
        encoding="utf-8",
    )
    print(f"{OUT.name}: 子集 {len(data)} 字节，base64 {len(payload)} 字符")


if __name__ == "__main__":
    main()
