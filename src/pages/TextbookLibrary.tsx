import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ArrowLeft, BookOpen, BookText, Download, Filter, Search } from 'lucide-react';
import { db } from '../lib/firebase';

interface Textbook {
  id: string;
  title: string;
  author: string;
  categoryId: string;
  topicId: string;
  description: string;
  pages: number;
  readTime: string;
  level: string;
  chapter: string;
  isPublished: boolean;
  offlineReady: boolean;
  sections?: { title: string; minutes: number; body: string }[];
}

const categoryLabels: Record<string, string> = {
  gened: 'General Education',
  profed: 'Professional Education',
  major: 'Major / Specialization',
};

export default function TextbookLibrary() {
  const navigate = useNavigate();
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const textbooksQuery = query(collection(db, 'textbooks'), orderBy('title', 'asc'));
    const unsubscribe = onSnapshot(textbooksQuery, (snapshot) => {
      const remoteBooks = snapshot.docs
        .map((bookDoc) => ({ id: bookDoc.id, ...bookDoc.data() } as Textbook))
        .filter((book) => book.isPublished !== false);

      setTextbooks(remoteBooks);
      setLoadError('');
      setIsLoading(false);
    }, (error) => {
      console.warn('Unable to load cloud textbooks', error);
      setTextbooks([]);
      setLoadError('Unable to load published textbooks from the database.');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredTextbooks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return textbooks.filter((book) => {
      const matchesCategory = selectedCategory === 'All' || book.categoryId === selectedCategory;
      const matchesSearch = !term ||
        book.title.toLowerCase().includes(term) ||
        (book.author || '').toLowerCase().includes(term) ||
        (book.description || '').toLowerCase().includes(term) ||
        categoryLabels[book.categoryId]?.toLowerCase().includes(term);

      return matchesCategory && matchesSearch;
    });
  }, [searchTerm, selectedCategory, textbooks]);

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col font-body">
      <header className="bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-30 shadow-sm px-5 py-4">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button onClick={() => navigate('/student/courses')} className="p-2 bg-surface-container text-on-surface-variant hover:text-on-surface rounded-full transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl font-black font-headline text-on-surface tracking-tight">Textbook Library</h1>
              <p className="text-xs font-bold text-on-surface-variant/50 uppercase tracking-widest">
                {textbooks.length.toLocaleString()} published LET resources
              </p>
            </div>
          </div>

          <div className="flex-1 max-w-2xl w-full flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={18} />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search textbooks, authors, topics"
                className="w-full bg-surface-container border border-outline-variant/30 rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:border-primary/40"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40" size={16} />
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                className="bg-surface-container border border-outline-variant/30 text-on-surface text-sm font-bold rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-primary/40 max-w-[180px]"
              >
                <option value="All">All subjects</option>
                <option value="gened">General Ed</option>
                <option value="profed">Professional Ed</option>
                <option value="major">Major</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-5 md:p-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[420px] text-on-surface-variant/50 text-center">
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="font-bold text-lg">Loading published textbooks...</p>
          </div>
        ) : filteredTextbooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[420px] text-on-surface-variant/50 text-center">
            <BookOpen size={48} className="mb-4 opacity-50" />
            <p className="font-bold text-lg">{loadError || 'No published textbooks found.'}</p>
            <p className="text-sm mt-2">
              {loadError ? 'Check your connection or Firestore rules.' : 'Published Firestore textbooks will appear here after admin seeding or approval.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredTextbooks.map((book) => (
              <article key={book.id} className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm flex flex-col min-h-[280px]">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="w-12 h-16 bg-primary rounded-lg flex items-center justify-center shrink-0 shadow-inner">
                    <BookText className="text-on-primary opacity-90" size={24} />
                  </div>
                  <div className="text-right">
                    <span className="inline-flex rounded-full bg-primary/10 text-primary px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                      {book.level}
                    </span>
                  </div>
                </div>

                <div className="flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50 mb-2">
                    {categoryLabels[book.categoryId] || book.categoryId} / {book.chapter}
                  </p>
                  <h2 className="font-headline font-extrabold text-lg leading-tight text-on-surface">{book.title}</h2>
                  <p className="text-xs text-on-surface-variant/60 mt-1">{book.author}</p>
                  <p className="text-sm text-on-surface-variant mt-4 leading-relaxed">{book.description}</p>
                  {book.sections && book.sections.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {book.sections.slice(0, 2).map((section) => (
                        <div key={section.title} className="rounded-xl bg-surface-container/50 border border-outline-variant/30 p-3">
                          <p className="text-xs font-extrabold text-on-surface">{section.title}</p>
                          <p className="text-[10px] text-on-surface-variant/60 mt-1">{section.minutes} min / {section.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-outline-variant/40 flex items-center justify-between gap-3">
                  <div className="text-xs font-bold text-on-surface-variant/60">
                    {book.pages} pages / {book.readTime}
                  </div>
                  <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary font-bold text-xs rounded-xl hover:opacity-90 transition-colors">
                    <Download size={14} />
                    Offline
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
