export default function AdminLoading() {
    return (
        <div className="h-full flex flex-col p-6 space-y-8 animate-pulse">
            <div className="flex justify-between items-center mb-8">
                <div className="space-y-2">
                    <div className="h-8 w-48 bg-gray-200 rounded-lg"></div>
                    <div className="h-4 w-32 bg-gray-100 rounded"></div>
                </div>
                <div className="h-10 w-24 bg-gray-200 rounded-lg"></div>
            </div>

            <div className="flex-1 overflow-x-auto">
                <div className="flex gap-6 min-w-max h-full pb-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="w-80 flex flex-col space-y-3">
                            {/* Column Header */}
                            <div className="h-12 w-full bg-gray-200 rounded-t-xl"></div>

                            {/* Column Body */}
                            <div className="flex-1 bg-gray-100/50 p-3 rounded-b-xl border border-gray-200 space-y-3">
                                {[1, 2, 3].map(j => (
                                    <div key={j} className="h-24 w-full bg-gray-200 rounded-lg"></div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
