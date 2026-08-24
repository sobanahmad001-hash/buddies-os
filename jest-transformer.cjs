const { createTransformer } = require("ts-jest").default;

module.exports = createTransformer({
  tsconfig: { jsx: "react-jsx" },
});
