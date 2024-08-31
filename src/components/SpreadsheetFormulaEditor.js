import React, { useState, useRef, useEffect } from 'react';
import './SpreadsheetFormulaEditor.css';

const SpreadsheetFormulaEditor = () => {
  const [formula, setFormula] = useState('=SUMIF(A1:A12, #foobar)');
  const activeCellRef = useRef(null);
  const formulaInputRef = useRef(null);
  const [hintPosition, setHintPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (activeCellRef.current) {
      const rect = activeCellRef.current.getBoundingClientRect();
      setHintPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }
  }, []);

  useEffect(() => {
    const resizeInput = () => {
      if (formulaInputRef.current) {
        formulaInputRef.current.style.width = 'auto';
        formulaInputRef.current.style.width = `${formulaInputRef.current.scrollWidth}px`;
      }
    };

    resizeInput();
    window.addEventListener('resize', resizeInput);
    return () => window.removeEventListener('resize', resizeInput);
  }, [formula]);

  const handleFormulaChange = (e) => {
    setFormula(e.target.value);
  };

  const renderFormulaInput = () => {
    return (
      <input
        ref={formulaInputRef}
        type="text"
        value={formula}
        onChange={handleFormulaChange}
        className="formula-input"
      />
    );
  };

  return (
    <div className="spreadsheet-container">
      <table className="spreadsheet-table">
        <thead>
          <tr>
            <th></th>
            <th>A</th>
            <th className="active-column">B</th>
            <th>C</th>
            <th>D</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="row-header">1</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td className="row-header">2</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr>
            <td className="row-header">3</td>
            <td></td>
            <td></td>
            <td>14</td>
            <td>10</td>
          </tr>
          <tr className="active-row">
            <td className="row-header">4</td>
            <td></td>
            <td className="formula-cell active-cell" ref={activeCellRef}>
              <div className="formula-input-container">
                {renderFormulaInput()}
              </div>
            </td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
      
      <div className="function-hint" style={{ top: hintPosition.top, left: hintPosition.left }}>
        <span className="function-name">SUMIF</span>
        <span className="function-params">(range, criteria)</span>
        <span className="hint-description">Lorem ipsum dolor sit amet</span>
        <button className="close-button">×</button>
      </div>
    </div>
  );
};

export default SpreadsheetFormulaEditor;