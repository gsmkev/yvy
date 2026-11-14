<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- All landing copy lives in src/content/site.ts and media in src/content/media.ts; components under src/components/yvy only read from them, so text changes never touch components.
- Keep hero copy in an opaque full-width band above the background overlays, and show synchronization only within the record-to-map visual; abstract transition spacers obscure the narrative.
- Read reduced-motion preferences through the hydration-safe shared hook so the first browser render matches the server.
