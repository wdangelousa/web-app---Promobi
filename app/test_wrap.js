// 2026-03-20
const doc = { pages: 2 }
const linesPerPage = 38
const wrappedLines = ['a', 'b', 'c']
const requiredPagesByText = Math.max(1, Math.ceil(wrappedLines.length / linesPerPage))
const totalPagesToCreate = Math.max((doc.pages || 1), requiredPagesByText)
