'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Image as ImageIcon, X, AlertCircle } from 'lucide-react';

interface FileUploadProps {
    onFilesSelected: (files: File[]) => void;
    onObservationChange?: (text: string) => void;
    acceptedFormats?: string; // e.g. ".pdf, .jpg, .png"
    maxSizeInMB?: number;
}

export const FileUpload = ({
    onFilesSelected,
    onObservationChange,
    acceptedFormats = ".pdf, .jpg, .jpeg, .png",
    maxSizeInMB = 50
}: FileUploadProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [observation, setObservation] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = Array.from(e.dataTransfer.files);
            // Basic validation could go here
            setFiles(prev => [...prev, ...newFiles]);
            onFilesSelected([...files, ...newFiles]);
        }
    }, [files, onFilesSelected]);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...newFiles]);
            onFilesSelected([...files, ...newFiles]);
        }
    };

    const removeFile = (index: number) => {
        const newFiles = files.filter((_, i) => i !== index);
        setFiles(newFiles);
        onFilesSelected(newFiles);
    };

    const handleObservation = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        setObservation(text);
        if (onObservationChange) onObservationChange(text);
    };

    return (
        <div className="w-full space-y-6">
            {/* Drag & Drop Zone */}
            <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                    relative group cursor-pointer
                    border-2 border-dashed rounded-2xl p-8
                    flex flex-col items-center justify-center text-center
                    transition-all duration-300 ease-in-out
                    ${isDragging
                        ? 'border-[var(--color-primary)] bg-orange-50 scale-[1.01]'
                        : 'border-slate-300 hover:border-[var(--color-primary)] hover:bg-slate-50'
                    }
                `}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={acceptedFormats}
                    className="hidden"
                    onChange={handleFileInput}
                />

                <div className={`
                    w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors
                    ${isDragging ? 'bg-white text-[var(--color-primary)] shadow-sm' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-[var(--color-primary)] group-hover:shadow-sm'}
                `}>
                    <Upload className="w-8 h-8" />
                </div>

                <h3 className="text-lg font-bold text-slate-700 mb-1">
                    Arraste seus arquivos aqui
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                    ou <span className="text-[var(--color-primary)] font-medium underline">clique para selecionar</span>
                </p>

                <div className="flex items-center gap-4 text-xs text-slate-400 uppercase tracking-wide font-medium">
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> PDF</span>
                    <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> JPG/PNG</span>
                </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                    <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Arquivos Selecionados ({files.length})</h4>
                    <div className="grid gap-3">
                        {files.map((file, index) => (
                            <div key={`${file.name}-${index}`} className="flex items-center p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-[var(--color-primary)] mr-3">
                                    {file.type.includes('pdf') ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-700 truncate">{file.name}</p>
                                    <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                                <button
                                    onClick={() => removeFile(index)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Observation Field */}
            <div className="space-y-2">
                <label htmlFor="observations" className="block text-sm font-bold text-slate-700">
                    Observações Adicionais
                </label>
                <textarea
                    id="observations"
                    rows={3}
                    placeholder="Ex: Nomes completos para verificar grafia, prazo de urgência, etc..."
                    value={observation}
                    onChange={handleObservation}
                    className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:bg-white transition-all resize-none text-sm"
                />
            </div>
        </div>
    );
};
