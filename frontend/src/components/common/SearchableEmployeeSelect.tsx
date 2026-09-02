import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Check, ChevronDown, X, Building2 } from 'lucide-react';
import { Employee } from '../../types/index.js';

interface SearchableEmployeeSelectProps {
  employees: Employee[];
  value: string;
  onChange: (employeeId: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
}

export const SearchableEmployeeSelect: React.FC<SearchableEmployeeSelectProps> = ({
  employees,
  value,
  onChange,
  required = false,
  label = 'Host Employee *',
  placeholder = 'Type to search employee by name, code or dept...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedEmployee = employees.find((e) => e.id === value);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // If query was modified without picking, reset display query to selected employee name
        if (selectedEmployee) {
          setQuery('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedEmployee]);

  // Filter employees based on guard's typing
  const filteredEmployees = employees.filter((emp) => {
    if (!query.trim()) return true;
    const term = query.toLowerCase().trim();
    const fullName = `${emp.first_name} ${emp.last_name || ''}`.toLowerCase();
    const dept = (emp.department_name || emp.department_code || '').toLowerCase();
    const desig = (emp.designation || '').toLowerCase();
    const code = (emp.employee_code || '').toLowerCase();
    return (
      fullName.includes(term) ||
      dept.includes(term) ||
      desig.includes(term) ||
      code.includes(term)
    );
  });

  const handleSelect = (emp: Employee) => {
    onChange(emp.id);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const displayValue = isOpen
    ? query
    : selectedEmployee
    ? `${selectedEmployee.first_name}${selectedEmployee.last_name ? ' ' + selectedEmployee.last_name : ''} (${selectedEmployee.department_name || selectedEmployee.department_code || 'General'})`
    : query;

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1">
          {label}
        </label>
      )}

      {/* Hidden input for HTML5 form validation if required */}
      {required && (
        <input
          tabIndex={-1}
          required={required}
          value={value}
          onChange={() => {}}
          className="opacity-0 absolute inset-0 pointer-events-none -z-10"
        />
      )}

      {/* Main Combobox Input */}
      <div
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
        className={`relative flex items-center w-full bg-slate-50 border rounded-xl cursor-text transition-colors ${
          isOpen
            ? 'border-sky-500 ring-2 ring-sky-100 bg-white'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />

        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            if (selectedEmployee) {
              setQuery('');
            }
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-14 py-2 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
        />

        <div className="absolute right-2 flex items-center gap-1">
          {selectedEmployee && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-sky-500' : ''
            }`}
          />
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100">
          <div className="p-2 bg-slate-50 text-[11px] font-bold text-slate-500 flex items-center justify-between border-b border-slate-100">
            <span>SUGGESTED HOST EMPLOYEES ({filteredEmployees.length})</span>
            <span className="text-[10px] font-normal text-slate-400">Type to filter</span>
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              No employee found matching &ldquo;<span className="font-semibold text-slate-700">{query}</span>&rdquo;
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              const isSelected = emp.id === value;
              const initials = `${emp.first_name[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase();

              return (
                <div
                  key={emp.id}
                  onClick={() => handleSelect(emp)}
                  className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-sky-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                        isSelected
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {initials || <User className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                        <span>
                          {emp.first_name} {emp.last_name || ''}
                        </span>
                        {emp.employee_code && (
                          <span className="px-1.5 py-0.2 font-mono text-[9px] bg-slate-100 text-slate-600 rounded">
                            {emp.employee_code}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{emp.department_name || emp.department_code || 'General'}</span>
                        {emp.designation && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-400">{emp.designation}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0 ml-2">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Selected Confirmation Badge */}
      {selectedEmployee && !isOpen && (
        <div className="mt-1.5 flex items-center justify-between px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-100 text-[11px]">
          <div className="text-sky-900 font-semibold truncate">
            Host: <span className="font-bold">{selectedEmployee.first_name} {selectedEmployee.last_name || ''}</span>
            <span className="text-sky-600 ml-1">({selectedEmployee.department_name || selectedEmployee.department_code || 'General'} • {selectedEmployee.designation || 'Staff'})</span>
          </div>
          <span className="text-[10px] font-mono bg-sky-200/60 text-sky-800 px-1.5 py-0.5 rounded font-bold">
            {selectedEmployee.employee_code || 'EMP'}
          </span>
        </div>
      )}
    </div>
  );
};
