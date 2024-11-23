import React, { useState, useCallback, useRef, useEffect, useImperativeHandle } from 'react';
import { colIndexToLetter, parseFormula } from '../utils';
import { ReactComponent as FormulaIcon } from '../assets/formula-icon.svg';
import { ReactComponent as SelectAllIcon } from '../assets/select-all-icon.svg';
import './DynamicSpreadsheet.css';

const Cell = ({ cellId, isSelected, isEditing, cellData, getCellValue, handleCellChange, handleKeyDown, onCellClick }) => {
  return (
    <td
      className={`cell ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`}
      onClick={() => onCellClick(cellId)}
    >
      <span>{getCellValue(cellId)}</span>
      {isEditing && (
        <div className="cell-input-overlay">
          {cellData.formula ? (
            <FormulaEditor
              formula={cellData.formula}
              onChange={(newFormula) => handleCellChange(cellId, newFormula)}
              onCommit={() => onCellClick(null)}
              onNavigate={(direction) => {
                const [col, row] = cellId.match(/([A-Z])(\d+)/).slice(1);
                const nextRow = parseInt(row) + (direction === 'down' ? 1 : -1);
                const nextCellId = `${col}${nextRow}`;
                onCellClick(nextCellId);
              }}
            />
          ) : (
            <input
              value={cellData.value || ''}
              onChange={(e) => handleCellChange(cellId, e.target.value)}
              onBlur={() => onCellClick(null)}
              onKeyDown={(e) => handleKeyDown(e, cellId)}
              autoFocus
            />
          )}
        </div>
      )}
    </td>
  );
};

const FormulaEditor = ({ formula, onChange, onCommit, onNavigate }) => {
  const [blocks, setBlocks] = useState([]);
  const [activeBlockIndex, setActiveBlockIndex] = useState(-1);
  const blocksRef = useRef([]);

  useEffect(() => {
    const newBlocks = parseFormulaIntoBlocks(formula);
    setBlocks(newBlocks);
    setActiveBlockIndex(newBlocks.length - 1);
  }, [formula]);

  useEffect(() => {
    if (activeBlockIndex >= 0 && blocksRef.current[activeBlockIndex]) {
      blocksRef.current[activeBlockIndex].focus();
    }
  }, [activeBlockIndex]);

  const handleBlockChange = (index, newValue) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], value: newValue };
    setBlocks(newBlocks);
    onChange(newBlocks.map(block => block.value).join(''));
  };

  const handleKeyDown = (e, index) => {
    switch (e.key) {
      case 'ArrowLeft':
        if (e.target.selectionStart === 0) {
          e.preventDefault();
          if (index > 0) {
            setActiveBlockIndex(index - 1);
            setTimeout(() => blocksRef.current[index - 1].focusEnd(), 0);
          }
        }
        break;
      case 'ArrowRight':
        if (e.target.selectionStart === e.target.value.length) {
          e.preventDefault();
          if (index < blocks.length - 1) {
            setActiveBlockIndex(index + 1);
            setTimeout(() => blocksRef.current[index + 1].focusStart(), 0);
          }
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        onCommit();
        onNavigate('up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        onCommit();
        onNavigate('down');
        break;
      case 'Backspace':
        if (e.target.selectionStart === 0 && index > 0) {
          e.preventDefault();
          const newBlocks = [...blocks];
          const currentBlock = newBlocks[index];
          const previousBlock = newBlocks[index - 1];
          previousBlock.value += currentBlock.value;
          newBlocks.splice(index, 1);
          setBlocks(newBlocks);
          setActiveBlockIndex(index - 1);
          onChange(newBlocks.map(block => block.value).join(''));
          setTimeout(() => blocksRef.current[index - 1].focusEnd(), 0);
        }
        break;
      case 'Enter':
      case 'Return':
        e.preventDefault();
        onCommit();
        onNavigate('down');
        break;
    }
  };

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
    if (/^[A-Z]+(?:\w+)?$/.test(value) && /[A-Z]{2,}/.test(value)) return 'formula-name'; // Function names like SUM, AVERAGE
    if (/^[A-Z]+\d+(?::[A-Z]+\d+)?$/.test(value)) return 'range';  // Cell references like A1, B2, or ranges like A1:B2
    if (/^\d+(?:\.\d+)?$/.test(value)) return 'number';
    if (/^"[^"]*"$/.test(value) || /^'[^']*'$/.test(value)) return 'string';
    if (/^[,()]$/.test(value)) return 'separator';
    if (/^[<>=]+$/.test(value)) return 'operator';
    return 'text';
  };

  return (
    <div className="formula-editor">
      {blocks.map((block, index) => (
        <FormulaBlock
          key={block.id}
          ref={(el) => blocksRef.current[index] = el}
          value={block.value}
          type={block.type}
          onChange={(newValue) => handleBlockChange(index, newValue)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onFocus={() => setActiveBlockIndex(index)}
        />
      ))}
    </div>
  );
};

const FormulaBlock = React.forwardRef(({ value, type, onChange, onKeyDown, onFocus }, ref) => {
  const [inputWidth, setInputWidth] = useState(0);
  const measureRef = useRef(null);
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    focusStart: () => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(0, 0);
      }
    },
    focusEnd: () => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
      }
    }
  }));

  useEffect(() => {
    if (measureRef.current) {
      const width = measureRef.current.offsetWidth;
      setInputWidth(Math.max(width - 4, 1));
    }
  }, [value]);

  const handleChange = (e) => {
    onChange(e.target.value);
  };

  return (
    <span className={`formula-block ${type}`}>
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        style={{ width: `${inputWidth}px` }}
      />
      <span ref={measureRef} className="measure-text" aria-hidden="true">
        {value || 'W'}
      </span>
    </span>
  );
});

const FormulaBar = ({ selectedCell, cellData, onFormulaChange, onNavigate }) => {
  const [isEditing, setIsEditing] = useState(false);

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'Enter':
      case 'Return':
        e.preventDefault();
        setIsEditing(false);
        onNavigate('down');
        break;
      case 'Tab':
        e.preventDefault();
        setIsEditing(false);
        onNavigate('right');
        break;
      case 'Escape':
        e.preventDefault();
        setIsEditing(false);
        break;
      case 'ArrowUp':
        if (!isEditing) {
          e.preventDefault();
          onNavigate('up');
        }
        break;
      case 'ArrowDown':
        if (!isEditing) {
          e.preventDefault();
          onNavigate('down');
        }
        break;
      case 'ArrowLeft':
        if (!isEditing && e.target.selectionStart === 0) {
          e.preventDefault();
          onNavigate('left');
        }
        break;
      case 'ArrowRight':
        if (!isEditing && e.target.selectionStart === e.target.value.length) {
          e.preventDefault();
          onNavigate('right');
        }
        break;
    }
  };

  return (
    <div className="formula-bar">
      <div className="formula-label">
        <FormulaIcon width="24" height="24" />
      </div>
      <div className="formula-editor-container">
        {cellData?.formula ? (
          <FormulaEditor
            formula={cellData.formula}
            onChange={onFormulaChange}
            onCommit={() => setIsEditing(false)}
            onNavigate={onNavigate}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <input
            type="text"
            value={cellData?.value || ''}
            onChange={(e) => onFormulaChange(e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            disabled={!selectedCell}
            title={!selectedCell ? "Select a cell to enter a formula" : ""}
            placeholder={selectedCell && isEditing ? "Enter a value or formula" : ""}
          />
        )}
      </div>
    </div>
  );
};

const DynamicSpreadsheet = ({ selectedCell, editingCell, onCellClick }) => {
  const [data, setData] = useState({});
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
      onCellClick(nextCellId);
    }
  };

  const handleNavigation = (direction) => {
    if (!selectedCell) return;
    
    const [col, row] = selectedCell.match(/([A-Z])(\d+)/).slice(1);
    const colIndex = col.charCodeAt(0) - 65;
    const rowIndex = parseInt(row) - 1;
    
    let nextCol = colIndex;
    let nextRow = rowIndex;
    
    switch (direction) {
      case 'up':
        nextRow = Math.max(0, rowIndex - 1);
        break;
      case 'down':
        nextRow = Math.min(19, rowIndex + 1); // Assuming 20 rows
        break;
      case 'left':
        nextCol = Math.max(0, colIndex - 1);
        break;
      case 'right':
        nextCol = Math.min(9, colIndex + 1); // Assuming 10 columns
        break;
    }
    
    const nextCellId = `${String.fromCharCode(65 + nextCol)}${nextRow + 1}`;
    onCellClick(nextCellId);
  };

  const renderCell = (rowIndex, colIndex) => {
    const cellId = `${colIndexToLetter(colIndex)}${rowIndex + 1}`;
    const isSelected = selectedCell === cellId;
    const isEditing = editingCell === cellId;
    const cellData = data[cellId] || {};

    return (
      <Cell
        key={cellId}
        cellId={cellId}
        isSelected={isSelected}
        isEditing={isEditing}
        cellData={cellData}
        getCellValue={getCellValue}
        handleCellChange={handleCellChange}
        handleKeyDown={handleKeyDown}
        onCellClick={onCellClick}
      />
    );
  };

  const renderRow = (rowIndex) => {
    const isActiveRow = selectedCell && parseInt(selectedCell.match(/\d+/)[0]) === rowIndex + 1;
    return (
      <tr key={rowIndex}>
        <td className={`row-header ${isActiveRow ? 'highlighted' : ''}`}>{rowIndex + 1}</td>
        {[...Array(10)].map((_, colIndex) => renderCell(rowIndex, colIndex))}
      </tr>
    );
  };

  return (
    <div className="spreadsheet-container">
      <FormulaBar
        selectedCell={selectedCell}
        cellData={selectedCell ? data[selectedCell] : null}
        onFormulaChange={(newValue) => {
          if (selectedCell) {
            handleCellChange(selectedCell, newValue);
          }
        }}
        onNavigate={handleNavigation}
      />
      <table className="spreadsheet-table">
        <thead>
          <tr>
            <th><SelectAllIcon width="12" height="12" /></th>
            {[...Array(10)].map((_, index) => {
              const isActiveCol = selectedCell && selectedCell[0] === colIndexToLetter(index);
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