import Sval from "sval";

export const interpreter = new Sval({
  // ECMA Version of the code
  // 3 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15
  // or 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024
  // or "latest"
  ecmaVer: "latest",
  // Code source type
  // "script" or "module"
  sourceType: "script",
  // Whether the code runs in a sandbox
  sandBox: true,
});
