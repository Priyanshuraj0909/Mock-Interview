import { Link } from 'react-router-dom';
import { ArrowUpRight, AudioLines, BrainCircuit, Check, ChevronRight, Code2, Target, Timer } from 'lucide-react';
import './WelcomePage.css';

const features = [
  { icon: BrainCircuit, title: 'Questions that fit your goals', text: 'Choose a subject, role, and difficulty. Build a practice session around what you want to learn.' },
  { icon: AudioLines, title: 'Find your interview voice', text: 'Rehearse technical answers out loud with optional browser voice tools, or type at your own pace.' },
  { icon: Target, title: 'Turn feedback into progress', text: 'Review your answers, see where you can improve, and make your next practice session count.' },
];

export default function WelcomePage() {
  return (
    <div className="welcome-page">
      <nav className="welcome-nav" aria-label="Main navigation">
        <Link className="welcome-brand" to="/"><span className="brand-icon"><Code2 size={21} /></span>mock<span className="brand-light">interview</span><span className="brand-dot">.</span></Link>
        <div className="nav-actions"><Link to="/login">Sign in</Link><Link className="nav-cta" to="/signup">Get started <ArrowUpRight size={15} /></Link></div>
      </nav>
      <main>
        <section className="welcome-hero">
          <div className="hero-copy">
            <div className="hero-eyebrow"><span /> YOUR NEXT CHAPTER STARTS HERE</div>
            <h1>Great interviews<br />start with<br /><span>good practice.</span></h1>
            <p>A little preparation goes a long way. Practice technical interviews, test your knowledge, and get AI feedback that helps you take the next step.</p>
            <div className="hero-actions"><Link className="primary-action" to="/signup">Start practicing <ArrowUpRight size={19} /></Link><Link className="secondary-action" to="/dashboardmain">Explore interview studio <ChevronRight size={17} /></Link></div>
            <div className="hero-note"><Check size={15} /> Your role. Your pace. Your next opportunity.</div>
          </div>
          <div className="studio-preview" aria-label="Example interview practice session">
            <div className="preview-bar"><span><span className="live-dot" /> INTERVIEW STUDIO</span><span className="preview-tag">Preview</span></div>
            <div className="preview-role"><span className="role-icon"><Code2 size={24} /></span><div><h2>Frontend developer</h2><p>Technical interview · Intermediate</p></div></div>
            <div className="preview-progress"><span /><span /><span className="progress-current" /><span /><span /></div>
            <div className="preview-question"><span>QUESTION 03 / 05</span><h3>How would you improve the performance of a React application?</h3><p>Think about rendering, loading, and the user experience.</p></div>
            <div className="preview-answer"><span className="waveform" aria-hidden="true">{[12,22,15,31,23,40,28,18,34,24,40,17,29,21,12].map((height, i) => <i key={i} style={{height}} />)}</span><span>Make room for your best answer.</span><AudioLines size={19} /></div>
            <div className="preview-bottom"><span><Timer size={14} /> Practice at your pace</span><span>One question at a time <ArrowUpRight size={14} /></span></div>
            <div className="feedback-note"><span className="feedback-icon"><Check size={17} /></span><div><strong>Build confidence, one session at a time.</strong><p>Get specific feedback on your answers.</p></div></div>
          </div>
        </section>
        <section className="practice-paths" aria-labelledby="paths-title"><div><span className="section-eyebrow">LESS GUESSWORK. MORE GROWTH.</span><h2 id="paths-title">A better way to prepare.</h2></div><p>From your first practice question<br />to your next big interview.</p></section>
        <section className="welcome-features" aria-label="Practice features">{features.map(({icon: Icon, title, text}, index) => <article key={title}><div className="feature-heading"><Icon size={24} /><span>0{index + 1}</span></div><h3>{title}</h3><p>{text}</p></article>)}</section>
        <div className="welcome-footer-cta"><span>Ready to see what you can do?</span><Link to="/dashboard">Try a mock test <ArrowUpRight size={17} /></Link></div>
      </main>
      <footer className="welcome-footer"><span>Mock Interview</span><span>Practice with purpose.</span><Link to="/login">Back to your practice <ArrowUpRight size={14} /></Link></footer>
    </div>
  );
}
