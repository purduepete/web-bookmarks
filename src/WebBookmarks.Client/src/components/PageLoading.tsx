import { useEffect, useState } from 'react';

export default function PageLoading() {
    const [show, setShow] = useState(false);
    useEffect(() => {
        const timer = window.setTimeout(() => setShow(true), 250);
        return () => window.clearTimeout(timer);
    }, []);
    return (
        <div className="page-loading">
            {show && (
                <div className="page-spinner" role="status" aria-label="Loading bookmarks">
                    <span aria-hidden="true" />
                </div>
            )}
        </div>
    );
}
