import React, { useState } from 'react';
import axios from 'axios';

interface Result {
  code: string;
  value: number;
  units: string;
  isAbnormal: boolean;
  range: string;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 10;

  const indexOfLast = currentPage * resultsPerPage;
  const indexOfFirst = indexOfLast - resultsPerPage;
  const currentResults = results.slice(indexOfFirst, indexOfLast);

  const totalPages = Math.ceil(results.length / resultsPerPage);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${process.env.VITE_API_URL}/api/upload`, formData);
      console.log(res.data);
      setResults(res.data.results);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-xl mx-auto bg-white p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-4">ORU File Uploader</h1>
        <input type="file" onChange={handleFileChange} className="mb-4" />
        <button onClick={handleSubmit} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          {loading ? 'Uploading...' : 'Upload'}
        </button>

        {results.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold mb-2">Results</h2>
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr>
                  <th className="border px-2 py-1">Code</th>
                  <th className="border px-2 py-1">Value</th>
                  <th className="border px-2 py-1">Units</th>
                  <th className="border px-2 py-1">Range</th>
                  <th className="border px-2 py-1">Flag</th>
                </tr>
              </thead>
              <tbody>
                {currentResults.map((res, idx) => (
                  <tr key={idx} className={res.isAbnormal ? 'bg-red-100 text-red-900 font-semibold' : ''}>
                    <td className="border px-2 py-1">{res.code}</td>
                    <td className="border px-2 py-1">{res.value}</td>
                    <td className="border px-2 py-1">{res.units}</td>
                    <td className="border px-2 py-1">{res.range}</td>
                    <td className="border px-2 py-1">
                      {res.isAbnormal ? '⚠️ High Risk' : 'Normal'}
                    </td>
                  </tr>
                ))}
              </tbody>


            </table>
            <div className="flex justify-between items-center mt-4">
              <button
                className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default App;
