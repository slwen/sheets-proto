export const colIndexToLetter = (index) => String.fromCharCode(65 + index);

export const parseFormula = (formula, getCellValue) => {
  if (formula.startsWith('=')) {
    try {
      const parseArgs = (argsString) => {
        return argsString.split(',').map(arg => {
          arg = arg.trim();
          if (arg.includes(':')) {
            return { type: 'range', value: arg };
          } else if (/^[A-Z]\d+$/.test(arg)) {
            return { type: 'cell', value: arg };
          } else if (arg.startsWith('"') && arg.endsWith('"')) {
            return { type: 'string', value: arg.slice(1, -1) };
          } else if (/^[><=]/.test(arg)) {
            return { type: 'criterion', value: arg };
          } else {
            return { type: 'number', value: parseFloat(arg) };
          }
        });
      };

      const getValuesFromRange = (range) => {
        const [startCell, endCell] = range.split(':');
        const startCol = startCell.charCodeAt(0) - 65;
        const endCol = endCell.charCodeAt(0) - 65;
        const startRow = parseInt(startCell.slice(1)) - 1;
        const endRow = parseInt(endCell.slice(1)) - 1;

        const values = [];
        for (let col = startCol; col <= endCol; col++) {
          for (let row = startRow; row <= endRow; row++) {
            const cellId = `${String.fromCharCode(65 + col)}${row + 1}`;
            values.push(getCellValue(cellId));
          }
        }
        return values;
      };

      if (formula.toUpperCase().startsWith('=SUMIF(')) {
        const argsString = formula.slice(7, -1);
        const args = parseArgs(argsString);
        if (args.length !== 2 && args.length !== 3) {
          return '#ERROR!';
        }

        const [range, criterion, sumRange] = args;
        const criterionValue = parseFloat(criterion.value.replace(/["><=]/g, ''));
        const operator = criterion.value.match(/^[><=]/)?.[0] || '=';

        let sum = 0;
        const rangeValues = range.type === 'range' ? getValuesFromRange(range.value) : [getCellValue(range.value)];
        const sumValues = sumRange ? (sumRange.type === 'range' ? getValuesFromRange(sumRange.value) : [getCellValue(sumRange.value)]) : rangeValues;

        for (let i = 0; i < rangeValues.length; i++) {
          const cellValue = parseFloat(rangeValues[i]);
          const sumValue = parseFloat(sumValues[i] || 0);

          if (isNaN(cellValue) || isNaN(sumValue)) continue;

          switch (operator) {
            case '>':
              if (cellValue > criterionValue) sum += sumValue;
              break;
            case '<':
              if (cellValue < criterionValue) sum += sumValue;
              break;
            case '=':
            default:
              if (cellValue === criterionValue) sum += sumValue;
              break;
          }
        }
        return sum;
      }

      if (formula.toUpperCase().startsWith('=SUM(')) {
        const argsString = formula.slice(5, -1);
        const args = parseArgs(argsString);

        let sum = 0;
        args.forEach(arg => {
          if (arg.type === 'range') {
            sum += getValuesFromRange(arg.value).reduce((a, b) => a + b, 0);
          } else if (arg.type === 'cell') {
            const cellValue = parseFloat(getCellValue(arg.value));
            if (!isNaN(cellValue)) {
              sum += cellValue;
            }
          } else {
            sum += arg.value;
          }
        });
        return sum;
      }

      const evaluatableFormula = formula.slice(1).replace(/[A-Z]\d+/g, (match) => {
        const value = getCellValue(match);
        return isNaN(value) ? '0' : value.toString();
      });

      return evaluateArithmeticExpression(evaluatableFormula);
    } catch (error) {
      return '#ERROR!';
    }
  }
  return formula;
};

export const evaluateArithmeticExpression = (expression) => {
  const tokens = expression.match(/(\d+\.?\d*|\+|\-|\*|\/|\(|\))/g) || [];
  const output = [];
  const operators = [];
  const precedence = {'+': 1, '-': 1, '*': 2, '/': 2};

  const applyOperator = () => {
    const b = output.pop();
    const a = output.pop();
    const op = operators.pop();
    switch (op) {
      case '+': output.push(a + b); break;
      case '-': output.push(a - b); break;
      case '*': output.push(a * b); break;
      case '/': output.push(a / b); break;
    }
  };

  tokens.forEach(token => {
    if (!isNaN(token)) {
      output.push(parseFloat(token));
    } else if ('+-*/'.includes(token)) {
      while (operators.length && precedence[operators[operators.length - 1]] >= precedence[token]) {
        applyOperator();
      }
      operators.push(token);
    } else if (token === '(') {
      operators.push(token);
    } else if (token === ')') {
      while (operators.length && operators[operators.length - 1] !== '(') {
        applyOperator();
      }
      operators.pop();
    }
  });

  while (operators.length) {
    applyOperator();
  }

  return output[0];
};