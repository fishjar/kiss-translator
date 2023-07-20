/**
 * 限制数字大小
 * @param {*} num
 * @param {*} min
 * @param {*} max
 * @returns
 */
export const limitNumber = (num, min = 0, max = 100) => {
  const number = parseInt(num);
  if (Number.isNaN(number) || number < min) {
    return min;
  } else if (number > max) {
    return max;
  }
  return number;
};

/**
 * 匹配是否为数组中的值
 * @param {*} arr
 * @param {*} val
 * @returns
 */
export const matchValue = (arr, val) => {
  if (arr.length === 0 || arr.includes(val)) {
    return val;
  }
  return arr[0];
};
