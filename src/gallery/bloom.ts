import { Color, FramebufferTexture, Vector2, type Texture, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { tuning } from '../config';

const BLUR_X = new Vector2(1, 0);
const BLUR_Y = new Vector2(0, 1);

/**
 * 블룸 후처리. 장면은 전처럼 캔버스에 바로 그리고(반투명 합성이 출력 색공간에서 일어나 옅은 바탕·빛 무리 밝기가 그대로다),
 * 그 화면을 텍스처로 복사해 밝은 곳(bloom.threshold 이상)을 여러 단계로 흐린 뒤 bloom.strength·bloom.radius 로 캔버스에 더한다.
 * 흐리는 셰이더는 three 의 UnrealBloomPass 것을 쓴다.
 */
export class BloomPipeline {
  private readonly pass: UnrealBloomPass;
  private readonly quad = new FullScreenQuad();
  private frame: FramebufferTexture;
  private readonly size = new Vector2();
  private readonly clearColor = new Color();

  constructor(private readonly renderer: WebGLRenderer) {
    const b = tuning.bloom;
    renderer.getDrawingBufferSize(this.size);
    this.frame = new FramebufferTexture(this.size.x, this.size.y);
    this.pass = new UnrealBloomPass(this.size.clone(), b.strength, b.radius, b.threshold);
  }

  /** 렌더러 크기를 바꾼 뒤 부른다 */
  resize(): void {
    this.renderer.getDrawingBufferSize(this.size);
    this.frame.dispose();
    this.frame = new FramebufferTexture(this.size.x, this.size.y);
    this.pass.setSize(this.size.x, this.size.y);
  }

  /** 캔버스에 그린 장면 위에 블룸을 더한다. scale(0~1)은 bloom.strength 에 곱하는 배율이다 */
  apply(scale: number): void {
    if (scale <= 0.001) return;
    const r = this.renderer;
    const p = this.pass;
    r.copyFramebufferToTexture(this.frame);
    const oldTarget = r.getRenderTarget();
    const oldAutoClear = r.autoClear;
    const oldClear = r.getClearColor(this.clearColor);
    const oldAlpha = r.getClearAlpha();
    r.autoClear = false;

    // 1. 밝은 곳 골라내기
    setUniform(p.highPassUniforms, 'tDiffuse', this.frame);
    setUniform(p.highPassUniforms, 'luminosityThreshold', p.threshold);
    this.draw(p.renderTargetBright, p.materialHighPassFilter);

    // 2. 단계마다 줄여 가며 가로·세로로 흐리기
    let input: Texture = p.renderTargetBright.texture;
    for (let i = 0; i < p.nMips; i++) {
      const blur = p.separableBlurMaterials[i];
      blur.uniforms.colorTexture.value = input;
      blur.uniforms.direction.value = BLUR_X;
      this.draw(p.renderTargetsHorizontal[i], blur);
      blur.uniforms.colorTexture.value = p.renderTargetsHorizontal[i].texture;
      blur.uniforms.direction.value = BLUR_Y;
      this.draw(p.renderTargetsVertical[i], blur);
      input = p.renderTargetsVertical[i].texture;
    }

    // 3. 단계들을 합치고 캔버스에 더한다(더하는 재질은 색공간 변환 없이 그대로 더한다)
    p.compositeMaterial.uniforms.bloomStrength.value = tuning.bloom.strength * scale;
    p.compositeMaterial.uniforms.bloomRadius.value = p.radius;
    this.draw(p.renderTargetsHorizontal[0], p.compositeMaterial);
    setUniform(p.copyUniforms, 'tDiffuse', p.renderTargetsHorizontal[0].texture);
    r.setRenderTarget(null);
    this.quad.material = p.blendMaterial;
    this.quad.render(r);

    r.setRenderTarget(oldTarget);
    r.autoClear = oldAutoClear;
    r.setClearColor(oldClear, oldAlpha);
  }

  dispose(): void {
    this.pass.dispose();
    this.quad.dispose();
    this.frame.dispose();
  }

  private draw(target: Parameters<WebGLRenderer['setRenderTarget']>[0], material: FullScreenQuad['material']): void {
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.quad.material = material;
    this.quad.render(this.renderer);
  }
}

function setUniform(uniforms: object, name: string, value: unknown): void {
  (uniforms as Record<string, { value: unknown }>)[name].value = value;
}
