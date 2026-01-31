export default function NewsList({ news }) {
  return (
    <section className="panel news-panel">
      <div className="panel-header">
        <h3>Related News</h3>
      </div>
      {(!news || news.length === 0) && <p>No news articles found.</p>}
      <div className="news-list">
        {news.slice(0, 15).map((article) => {
          const timestamp = article.providerPublishTime
            ? article.providerPublishTime * 1000
            : article.published
            ? Date.parse(article.published)
            : null
          const published = timestamp ? new Date(timestamp) : null
          const thumb =
            article.thumbnail?.resolutions?.[0]?.url ||
            article.image ||
            '/static/icons/yahoo-news.jpg'
          return (
            <article key={article.link || article.title} className="news-card">
              <a href={article.link || '#'} target="_blank" rel="noreferrer">
                <div className="news-thumb">
                  <img src={thumb} alt={article.title || 'News image'} />
                </div>
                <div className="news-body">
                  <h4>{article.title}</h4>
                  <p>{article.publisher || 'Yahoo Finance'}</p>
                  <span>{published ? published.toLocaleString() : ''}</span>
                </div>
              </a>
            </article>
          )
        })}
      </div>
    </section>
  )
}
