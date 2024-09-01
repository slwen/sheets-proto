import React, { useState, useCallback, useRef, useEffect } from 'react';
import './DynamicSpreadsheet.css';

// Utility function to convert column index to letter
const colIndexToLetter = (index) => String.fromCharCode(65 + index);

// Utility function to parse formulas
const parseFormula = (formula, getCellValue) => {
  if (formula.startsWith('=')) {
    try {
      // Helper function to parse arguments
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

      // Helper function to get values from a range
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

      // Handle SUMIF function
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

      // Handle SUM function
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

      // Replace cell references with their values
      const evaluatableFormula = formula.slice(1).replace(/[A-Z]\d+/g, (match) => {
        const value = getCellValue(match);
        return isNaN(value) ? '0' : value.toString();
      });

      // Use a safe arithmetic evaluator instead of Function constructor
      return evaluateArithmeticExpression(evaluatableFormula);
    } catch (error) {
      return '#ERROR!';
    }
  }
  return formula;
};

// Safe arithmetic expression evaluator
const evaluateArithmeticExpression = (expression) => {
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
      operators.pop(); // Remove the '('
    }
  });

  while (operators.length) {
    applyOperator();
  }

  return output[0];
};

const Cell = ({ cellId, isActive, cellData, getCellValue, handleCellChange, handleKeyDown, setActiveCell }) => {
  return (
    <td
      className={`cell ${isActive ? 'active' : ''}`}
      onClick={() => setActiveCell(cellId)}
    >
      <span>{getCellValue(cellId)}</span>
      {isActive && (
        <div className="cell-input-overlay">
          {cellData.formula ? (
            <FormulaEditor
              formula={cellData.formula}
              onChange={(newFormula) => handleCellChange(cellId, newFormula)}
            />
          ) : (
            <input
              value={cellData.value || ''}
              onChange={(e) => handleCellChange(cellId, e.target.value)}
              onBlur={() => setActiveCell(null)}
              onKeyDown={(e) => handleKeyDown(e, cellId)}
              autoFocus
            />
          )}
        </div>
      )}
    </td>
  );
};

const FormulaEditor = ({ formula, onChange }) => {
  const [blocks, setBlocks] = useState([]);
  const [activeBlockIndex, setActiveBlockIndex] = useState(-1);

  useEffect(() => {
    setBlocks(parseFormulaIntoBlocks(formula));
  }, [formula]);

  const parseFormulaIntoBlocks = (formula) => {
    // Regex to match different parts of the formula, including formula names
    const regex = /=|[A-Z]+(?:\w+)?(?=\()|[A-Z]+\d*(?::[A-Z]+\d*)?|\d+(?:\.\d+)?|"[^"]*"|'[^']*'|[,()]|[<>=]+|[^\s]+/g;
    const matches = formula.match(regex) || [];
    return matches.map((match, index) => ({
      id: index,
      value: match,
      type: getBlockType(match),
    }));
  };

  const getBlockType = (value) => {
    if (value === '=') return 'operator';
    if (/^[A-Z]+(?:\w+)?$/.test(value)) return 'formula-name'; // Match formula names like SUM, SUMIF
    if (/^[A-Z]+\d*(?::[A-Z]+\d*)?$/.test(value)) return 'range';
    if (/^\d+(?:\.\d+)?$/.test(value)) return 'number';
    if (/^"[^"]*"$/.test(value) || /^'[^']*'$/.test(value)) return 'string';
    if (/^[,()]$/.test(value)) return 'separator';
    if (/^[<>=]+$/.test(value)) return 'operator';
    return 'text';
  };

  const handleBlockChange = (index, newValue) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], value: newValue };
    
    // Remove empty blocks, except the last one
    const filteredBlocks = newBlocks.filter((block, i) => block.value !== '' || i === newBlocks.length - 1);
    
    setBlocks(filteredBlocks);
    onChange(filteredBlocks.map(block => block.value).join(''));
    
    // Adjust activeBlockIndex if blocks were removed
    if (filteredBlocks.length < newBlocks.length) {
      setActiveBlockIndex(Math.min(index, filteredBlocks.length - 1));
    }
  };

  const handleBlockDelete = (index) => {
    if (blocks.length > 1) {
      const newBlocks = blocks.filter((_, i) => i !== index);
      setBlocks(newBlocks);
      onChange(newBlocks.map(block => block.value).join(''));
      setActiveBlockIndex(Math.max(0, index - 1));
    } else {
      // If it's the last block, clear it instead of deleting
      handleBlockChange(index, '');
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) {
      e.preventDefault();
      setActiveBlockIndex(Math.max(0, index - 1));
    } else if (e.key === 'ArrowRight' && e.target.selectionEnd === blocks[index].value.length) {
      e.preventDefault();
      setActiveBlockIndex(Math.min(blocks.length - 1, index + 1));
    }
  };

  return (
    <div className="formula-editor">
      {blocks.map((block, index) => (
        <FormulaBlock
          key={block.id}
          value={block.value}
          type={block.type}
          isActive={index === activeBlockIndex}
          onChange={(newValue) => handleBlockChange(index, newValue)}
          onDelete={() => handleBlockDelete(index)}
          onFocus={() => setActiveBlockIndex(index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
        />
      ))}
    </div>
  );
};

const FormulaBlock = ({ value, type, isActive, onChange, onDelete, onFocus, onKeyDown }) => {
  const inputRef = useRef(null);
  const measureRef = useRef(null);
  const [inputWidth, setInputWidth] = useState(0);

  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive]);

  useEffect(() => {
    if (measureRef.current) {
      const width = measureRef.current.offsetWidth;
      setInputWidth(Math.max(width + 2, 8)); // Reduced padding and minimum width
    }
  }, [value]);

  const handleChange = (e) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && e.target.value === '') {
      onDelete();
    } else {
      onKeyDown(e);
    }
  };

  const blockClass = `formula-block ${type}`;

  return (
    <span className={blockClass}>
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        style={{ width: `${inputWidth}px` }}
      />
      <span ref={measureRef} className="measure-text" aria-hidden="true">
        {value || 'W'}
      </span>
    </span>
  );
};

const DynamicSpreadsheet = () => {
  const [data, setData] = useState({});
  const [activeCell, setActiveCell] = useState(null);
  const measureRef = useRef(null);

  useEffect(() => {
    // Seed the spreadsheet with some dummy data
    const dummyData = {
      'A1': { value: 'Name' },
      'B1': { value: 'Score' },
      'C1': { value: 'Team' },
      'A2': { value: 'John' },
      'B2': { value: '30' },
      'C2': { value: 'Red' },
      'A3': { value: 'Alice' },
      'B3': { value: '25' },
      'C3': { value: 'Blue' },
      'A4': { value: 'Total' },
      'B4': { formula: '=SUM(B2:B3)' }
    };
    setData(dummyData);
  }, []);

  const getCellValue = useCallback((cellId) => {
    const cellData = data[cellId];
    if (!cellData) {
      return '';
    }
    if (cellData.formula) {
      return parseFormula(cellData.formula, getCellValue);
    }
    // If it's a number, return it as a number, otherwise return as a string
    return isNaN(cellData.value) ? cellData.value : parseFloat(cellData.value);
  }, [data]);

  const handleCellChange = (cellId, value) => {
    setData(prevData => ({
      ...prevData,
      [cellId]: { value, formula: value.startsWith('=') ? value : null }
    }));
  };

  const handleKeyDown = (event, cellId) => {
    if (event.key === 'Enter' || event.key === 'Return') {
      event.preventDefault();
      const [col, row] = cellId.match(/([A-Z])(\d+)/).slice(1);
      const nextRow = parseInt(row) + 1;
      const nextCellId = `${col}${nextRow}`;
      setActiveCell(nextCellId);
    }
  };

  const renderCell = (rowIndex, colIndex) => {
    const cellId = `${colIndexToLetter(colIndex)}${rowIndex + 1}`;
    const isActive = activeCell === cellId;
    const cellData = data[cellId] || {};

    return (
      <Cell
        key={cellId}
        cellId={cellId}
        isActive={isActive}
        cellData={cellData}
        getCellValue={getCellValue}
        handleCellChange={handleCellChange}
        handleKeyDown={handleKeyDown}
        setActiveCell={setActiveCell}
      />
    );
  };

  const renderRow = (rowIndex) => {
    const isActiveRow = activeCell && parseInt(activeCell.match(/\d+/)[0]) === rowIndex + 1;
    return (
      <tr key={rowIndex}>
        <td className={`row-header ${isActiveRow ? 'highlighted' : ''}`}>{rowIndex + 1}</td>
        {[...Array(10)].map((_, colIndex) => renderCell(rowIndex, colIndex))}
      </tr>
    );
  };

  return (
    <div className="spreadsheet-container">
      <table className="spreadsheet-table">
        <thead>
          <tr>
            <th></th>
            {[...Array(10)].map((_, index) => {
              const isActiveCol = activeCell && activeCell[0] === colIndexToLetter(index);
              return (
                <th 
                  key={index} 
                  className={`col-header ${isActiveCol ? 'highlighted' : ''}`}
                >
                  {colIndexToLetter(index)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {[...Array(20)].map((_, index) => renderRow(index))}
        </tbody>
      </table>
      <span ref={measureRef} className="measure-text" aria-hidden="true" />
    </div>
  );
};

export default DynamicSpreadsheet;