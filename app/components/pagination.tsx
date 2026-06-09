"use client";
import { useState } from "react";

const range = (start: number, end: number) =>
  [...new Array(end - start).keys()].map((el) => el + start);

interface PaginationProps {
  currentPage: number;
  total: number;
  limit: number;
  onPageChange: (page: number, pageSize?: number) => void;
}

function getPagesCut(pagesCount: number, pagesCutCount: number, currentPage: number) {
  const ceiling = Math.ceil(pagesCutCount / 2);
  const floor = Math.floor(pagesCutCount / 2);

  if (pagesCount < pagesCutCount) {
    return { start: 1, end: pagesCount + 1 };
  } else if (currentPage <= ceiling) {
    return { start: 1, end: pagesCutCount + 1 };
  } else if (currentPage + floor >= pagesCount) {
    return { start: pagesCount - pagesCutCount + 1, end: pagesCount + 1 };
  } else {
    return { start: currentPage - ceiling + 1, end: currentPage + floor + 1 };
  }
}

const Pagination = ({ currentPage, total, limit, onPageChange }: PaginationProps) => {
  const [selectedPageSize, setSelectedPageSize] = useState(limit);

  // Use selectedPageSize (not the stale limit prop) for all calculations.
  const pagesCount = Math.ceil(total / selectedPageSize);
  const pagesCut = getPagesCut(pagesCount, 5, currentPage);
  const pages = range(pagesCut.start, pagesCut.end);
  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === pagesCount;

  function handlePageSizeChange(pageSize: number) {
    setSelectedPageSize(pageSize);
    onPageChange(1, pageSize);
  }

  function navBtn(
    label: string,
    targetPage: number,
    disabled: boolean,
  ) {
    return (
      <button
        key={label}
        className={`btn btn-sm join-item ${disabled ? "btn-disabled" : ""}`}
        onClick={() => !disabled && onPageChange(targetPage, selectedPageSize)}
        aria-disabled={disabled}
      >
        {label}
      </button>
    );
  }

  if (pagesCount <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Page size selector */}
      <div className="flex items-center gap-2 text-sm opacity-70">
        <span>Rows per page:</span>
        <select
          className="select select-sm select-bordered"
          value={selectedPageSize}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
        >
          {[10, 20, 30, 50].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* Page info */}
      <span className="text-sm opacity-50">
        Page {currentPage} of {pagesCount} &mdash; {total} total
      </span>

      {/* Page buttons */}
      <div className="join">
        {navBtn("«", 1, isFirstPage)}
        {navBtn("‹", currentPage - 1, isFirstPage)}
        {pages.map((page) => (
          <button
            key={page}
            className={`btn btn-sm join-item ${page === currentPage ? "btn-active" : ""}`}
            onClick={() => onPageChange(page, selectedPageSize)}
          >
            {page}
          </button>
        ))}
        {navBtn("›", currentPage + 1, isLastPage)}
        {navBtn("»", pagesCount, isLastPage)}  {/* fix: was pages.length */}
      </div>
    </div>
  );
};

export default Pagination;
