import { useState, useEffect } from "react";
import TextField from "@mui/material/TextField";
import { limitNumber, limitFloat } from "../libs/utils";

function ValidationInput({
  value,
  onChange,
  name,
  min,
  max,
  isFloat = false,
  ...props
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleLocalChange = (e) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    const numValue = Number(localValue);

    if (isNaN(numValue)) {
      setLocalValue(value);
      return;
    }

    const validatedValue = isFloat
      ? limitFloat(numValue, min, max)
      : limitNumber(numValue, min, max);

    if (validatedValue !== numValue) {
      setLocalValue(validatedValue);
    }

    onChange({
      target: {
        name: name,
        value: validatedValue,
      },
      preventDefault: () => {},
    });
  };

  return (
    <TextField
      {...props}
      type="number"
      name={name}
      value={localValue}
      onChange={handleLocalChange}
      onBlur={handleBlur}
    />
  );
}

export default ValidationInput;
