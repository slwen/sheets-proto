import React, { useState } from 'react';
import './App.css';
import DynamicSpreadsheet from './components/DynamicSpreadsheet';

function App() {
  const [selectedCell, setSelectedCell] = useState(null);
  const [editingCell, setEditingCell] = useState(null);

  const handleCellClick = (cellId) => {
    if (selectedCell === cellId) {
      setEditingCell(cellId);
    } else {
      setSelectedCell(cellId);
      setEditingCell(null);
    }
  };

  return (
    <DynamicSpreadsheet 
      selectedCell={selectedCell}
      editingCell={editingCell}
      onCellClick={handleCellClick}
    />
  );
}

export default App;
