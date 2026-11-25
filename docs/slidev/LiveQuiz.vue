<script setup lang="ts">
// LiveQuiz.vue — bettet die Beamer-Ansicht des IDA-Live-Quiz in eine Slidev-Folie ein.
// Ziel: Slidev v53 (useSlideContext, $clicks, $page, $renderContext, useNav).
// Vertrag (Spec §5.5): Parent -> iframe { typ: "iuk-quiz", schritt }, iframe -> Parent
// { typ: "iuk-quiz-stand", schritt, schrittAnzahl }. Schritte sind absolut, der Server ist idempotent.
import { useNav, useSlideContext } from '@slidev/client'
import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'

const props = defineProps<{ src: string }>()

const { $page, $clicks, $frontmatter, $renderContext } = useSlideContext()
const { currentPage } = useNav()

const rahmen = ref<HTMLIFrameElement | null>(null)
const schrittAnzahl = ref<number | null>(null)

// Das iframe gibt es nur in der Folienansicht und im Präsenterfenster. In der Übersicht und in der
// „nächste Folie“-Vorschau bleibt es leer: dort soll es weder laden noch steuern.
const zeigen = computed(() => ['slide', 'presenter'].includes(String(unref($renderContext))))
// Nur die aktuelle Folie steuert, keine vorab gerenderte.
const aktuell = computed(() => Number(unref(currentPage)) === Number(unref($page)))
const schritt = computed(() => Math.max(0, Number(unref($clicks)) || 0))

function sende() {
  if (!zeigen.value || !aktuell.value) return
  rahmen.value?.contentWindow?.postMessage({ typ: 'iuk-quiz', schritt: schritt.value }, '*')
}

// Beim Betreten der Folie und bei jedem Klick den absoluten Schritt senden.
watch([schritt, aktuell], sende, { flush: 'post' })

function hoere(e: MessageEvent) {
  if (e.source !== rahmen.value?.contentWindow) return
  const d = e.data as { typ?: unknown; schritt?: unknown; schrittAnzahl?: unknown }
  if (!d || d.typ !== 'iuk-quiz-stand' || typeof d.schrittAnzahl !== 'number') return
  const erstes = schrittAnzahl.value === null
  schrittAnzahl.value = d.schrittAnzahl
  // Das erste „Stand“ heißt: der Beamer hört jetzt zu. Erst dann gilt unser Schritt.
  if (erstes) sende()
}

// Der Klick auf die Bühne darf den Fokus nicht ins iframe ziehen, sonst gehen Slidevs Tasten nicht mehr.
function fokusZurueck() {
  const dokument = rahmen.value?.ownerDocument
  if (!dokument || dokument.activeElement !== rahmen.value) return
  rahmen.value?.blur()
  window.focus()
  dokument.body?.focus?.()
}
function beiBlur() {
  // `blur` am Fenster kommt, wenn der Fokus ins iframe wandert; activeElement ist dann das iframe.
  setTimeout(fokusZurueck, 0)
}

onMounted(() => {
  window.addEventListener('message', hoere)
  window.addEventListener('blur', beiBlur)
})
onBeforeUnmount(() => {
  window.removeEventListener('message', hoere)
  window.removeEventListener('blur', beiBlur)
})

const klicksFolie = computed(() => Number((unref($frontmatter) as { clicks?: number } | undefined)?.clicks ?? 0))
const warnung = computed(() => {
  const n = schrittAnzahl.value
  if (n === null || n - 1 <= klicksFolie.value) return null
  if (!(unref($renderContext) === 'presenter' || import.meta.env.DEV)) return null
  return `Quiz hat jetzt ${n} Schritte — clicks im Frontmatter auf ${n - 1} setzen`
})
</script>

<template>
  <div class="iuk-quiz">
    <iframe
      v-if="zeigen"
      ref="rahmen"
      :src="props.src"
      tabindex="-1"
      referrerpolicy="no-referrer"
      title="Live-Quiz"
      @focus="fokusZurueck"
      @pointerdown.capture="() => setTimeout(fokusZurueck, 0)"
    />
    <p v-if="warnung" class="iuk-quiz-warnung" role="status">{{ warnung }}</p>
  </div>
</template>

<style scoped>
.iuk-quiz {
  position: absolute;
  inset: 0;
  line-height: normal;
}
.iuk-quiz iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
.iuk-quiz-warnung {
  position: absolute;
  top: 8px;
  right: 8px;
  margin: 0;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 14px;
  background: #fde68a;
  color: #451a03;
}
</style>
