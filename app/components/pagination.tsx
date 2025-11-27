"use client";

import { useState } from "react";

const range = (start: number, end: number) => {
  return [...Array(end - start).keys()].map((el) => el + start);
};

interface PaginationItemProps {
  page: string | number;
  currentPage: number;
  onPageChange: (arg0: number, arg1?: number) => void;
  isDisabled: boolean;
}

interface PaginationProps {
  currentPage: number;
  total: number;
  limit: number;
  onPageChange: (arg0: number, arg1?: number) => void;
}
interface GetPagesCutProps {
  pagesCount: number;
  pagesCutCount: number;
  currentPage: number;
}
const getPagesCut = ({
  pagesCount,
  pagesCutCount,
  currentPage,
}: GetPagesCutProps) => {
  const ceiling = Math.ceil(pagesCutCount / 2);
  const floor = Math.floor(pagesCutCount / 2);

  if (pagesCount < pagesCutCount) {
    return { start: 1, end: pagesCount + 1 };
  } else if (currentPage >= 1 && currentPage <= ceiling) {
    return { start: 1, end: pagesCutCount + 1 };
  } else if (currentPage + floor >= pagesCount) {
    return { start: pagesCount - pagesCutCount + 1, end: pagesCount + 1 };
  } else {
    return { start: currentPage - ceiling + 1, end: currentPage + floor + 1 };
  }
};

const PaginationItem = ({
  page,
  currentPage,
  onPageChange,
  isDisabled,
}: PaginationItemProps) => {
  return (
    <button
      className={`btn join-item ${page === currentPage && "btn-active"} ${isDisabled && "btn-disabled"}`}
      onClick={() => onPageChange(page as number)}
    >
      <span className="page-link">{page}</span>
    </button>
  );
};

const Pagination = ({
  currentPage,
  total,
  limit,
  onPageChange,
}: PaginationProps) => {
  const [selectedPageSize, setSelectedPageSize] = useState(limit);
  const pagesCount = Math.ceil(total / limit);
  const pagesCut = getPagesCut({ pagesCount, pagesCutCount: 3, currentPage });
  const pages = range(pagesCut.start, pagesCut.end);
  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === pagesCount;

  function handlePageSizeChange(pageSize: number) {
    setSelectedPageSize(pageSize);
    onPageChange(1, pageSize);
  }

  return (
    <div className="flex justify-between">
      <select
        className="select"
        value={selectedPageSize}
        onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={30}>30</option>
      </select>
      <ul className="join">
        <PaginationItem
          page="First"
          currentPage={currentPage}
          onPageChange={() => onPageChange(1, selectedPageSize)}
          isDisabled={isFirstPage}
        />
        <PaginationItem
          page="Prev"
          currentPage={currentPage}
          onPageChange={() => onPageChange(currentPage - 1, selectedPageSize)}
          isDisabled={isFirstPage}
        />
        {pages.map((page) => (
          <PaginationItem
            page={page.toString()}
            key={page}
            currentPage={currentPage}
            onPageChange={onPageChange}
            isDisabled={currentPage === page}
          />
        ))}
        <PaginationItem
          page="Next"
          currentPage={currentPage}
          onPageChange={() => onPageChange(currentPage + 1, selectedPageSize)}
          isDisabled={isLastPage}
        />
        <PaginationItem
          page="Last"
          currentPage={currentPage}
          onPageChange={() => onPageChange(pages.length, selectedPageSize)}
          isDisabled={isLastPage}
        />
      </ul>
    </div>
  );
};
export default Pagination;
