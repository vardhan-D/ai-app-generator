"use client";

import Papa from "papaparse";
import { useRef, useState } from "react";

type CsvImportProps = {
  onDataParsed: (rows: any[]) => void;
};

export default function CsvImport({ onDataParsed }: CsvImportProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    setErrorMessage("");
    setRowCount(0);

    if (!file) return;

    const isCsvFile =
      file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");

    if (!isCsvFile) {
      setFileName("");
      setErrorMessage("Please upload a valid .csv file.");
      onDataParsed([]);
      return;
    }

    setFileName(file.name);
    setIsParsing(true);

    Papa.parse<Record<string, any>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = Array.isArray(result.data) ? result.data : [];

        const cleanedRows = rows.filter((row) =>
          Object.values(row).some(
            (value) =>
              value !== undefined &&
              value !== null &&
              String(value).trim() !== ""
          )
        );

        if (result.errors.length > 0) {
          console.warn("CSV Parse Warnings:", result.errors);
        }

        if (cleanedRows.length === 0) {
          setErrorMessage("CSV file was parsed, but no valid rows were found.");
          setRowCount(0);
          onDataParsed([]);
          setIsParsing(false);
          return;
        }

        setRowCount(cleanedRows.length);
        onDataParsed(cleanedRows);
        setIsParsing(false);
      },
      error: (error) => {
        console.error("CSV Parse Error:", error);
        setErrorMessage("Could not parse CSV file. Please check the file format.");
        setRowCount(0);
        onDataParsed([]);
        setIsParsing(false);
      },
    });
  };

  const clearFile = () => {
    setFileName("");
    setRowCount(0);
    setErrorMessage("");
    onDataParsed([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="border p-4 rounded-md mb-4 bg-white">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h2 className="text-lg font-semibold">Import CSV</h2>
          <p className="text-sm text-gray-500">
            Upload a CSV file, then map its columns to your configured fields.
          </p>
        </div>

        {fileName && (
          <button
            type="button"
            onClick={clearFile}
            className="border px-3 py-2 rounded text-sm hover:bg-gray-50"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileUpload}
          className="block w-full text-sm border rounded p-2"
        />

        {isParsing && (
          <p className="text-sm text-gray-600">Parsing CSV file...</p>
        )}

        {fileName && !errorMessage && (
          <div className="text-sm text-gray-700 bg-gray-50 border rounded p-3">
            <p>
              <span className="font-medium">Selected file:</span> {fileName}
            </p>

            {rowCount > 0 && (
              <p>
                <span className="font-medium">Parsed rows:</span> {rowCount}
              </p>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-300 rounded p-3">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}