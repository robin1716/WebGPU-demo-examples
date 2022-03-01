const ready = glslang();
ready.then(init);
const vertexShaderGLSL = `
	#version 450
	layout(location = 0) in vec4 position;
  layout(set=0,binding = 0) uniform Uniforms {
    mat4 pMatrix;
    mat4 vMatrix;
    mat4 mMatrix;
} uniforms;
	void main() {
		gl_Position = uniforms.pMatrix*uniforms.vMatrix*uniforms.mMatrix*position;
	}
			`;
const fragmentShaderGLSL = `
	#version 450
	layout(location = 0) out vec4 outColor;
	void main() {
		outColor = vec4(0.5, 1.0, 0.5, 1.0);
	}
`;
function makeShaderModule_GLSL(glslang, device, type, source) {
    let shaderModuleDescriptor = {
      code: glslang.compileGLSL(source, type),
      source: source
    };
    let shaderModule = device.createShaderModule(shaderModuleDescriptor);
    return shaderModule;
  }
async function init(glslang) {

    const gpu = navigator.gpu; 
    if(!gpu){
        console.log("! Your device dont support WebGPU");
        return;
    }
    else{
        console.log("Congrats- WebGPU supported in your DEVICE")
    }
    const adapter = await gpu.requestAdapter();
    const device = await adapter.requestDevice();
/*-------------------------------*/

  const cvs = document.createElement('canvas');
  cvs.width = 900;
  cvs.height = 700;
  document.body.appendChild(cvs);  // adding canvas tag to body of html
  const context = cvs.getContext('webgpu');  

  const presentationFormat = context.getPreferredFormat(adapter);  // default data format in which pixels are stored in a physical device
  // swapchain is merged with context

  context.configure({     
    device: device,
    format: presentationFormat,
});
  console.log('context', context);

  let vShaderModule = makeShaderModule_GLSL(glslang, device, 'vertex', vertexShaderGLSL);
  let fShaderModule = makeShaderModule_GLSL(glslang, device, 'fragment', fragmentShaderGLSL);

 let response = await fetch('model/cone2.json');
 let model = await response.json();

 const vertexData = new Float32Array(model.vertices);

  const vertexBuffer = device.createBuffer({  // only the buffer is created with vertex size.it dont contain any data
  size: vertexData.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST ,  
  mappedAtCreation: true  // GPU buffer is available for CPU  // GPU buffer is mapped with CPU
});
  const arrayBuffer = vertexBuffer.getMappedRange(); //associated buffer can be retrieved(get ) by calling this function

  new Float32Array(arrayBuffer).set(vertexData);  // load data into buffer
  vertexBuffer.unmap();

    const indexData = new Uint32Array(model.indices);

    const indexBuffer = device.createBuffer({
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });

    new Uint32Array(indexBuffer.getMappedRange()).set(indexData);
    indexBuffer.unmap();

    const pipeline = device.createRenderPipeline({
      vertex: {
        module: vShaderModule,
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 4 * (3),
            attributes: [{
              shaderLocation: 0,
              format: "float32x3",
              offset: 0
            }]
          }
        ]
      },
      fragment: {
        module: fShaderModule,
        entryPoint: "main",
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: "line-list",
      },
        depthStencil:{
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less" 
    }
    });

    const depthTexture = device.createTexture({
      size: [cvs.width, cvs.height , 1],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });  
    const depthView =depthTexture.createView();

    const uniformBuffer = device.createBuffer({
      size: 64 + 64 + 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const uniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{
        binding: 0,
        resource: {
            buffer: uniformBuffer,
            offset: 0,
            size: 64 + 64 + 64 // PROJMATRIX + VIEWMATRIX + MODELMATRIX
        }
      },
    ]
});

    let MODELMATRIX = glMatrix.mat4.create();
    let VIEWMATRIX = glMatrix.mat4.create(); 
    let PROJMATRIX = glMatrix.mat4.create();
    
    glMatrix.mat4.lookAt(VIEWMATRIX, [0.0, 0.0, 10.0], [0.0, 0.0, 0.0], [0.0, 1.0, 0.0]);

    glMatrix.mat4.identity(PROJMATRIX);
    let fovy = 40 * Math.PI / 180;
    glMatrix.mat4.perspective(PROJMATRIX, fovy, cvs.width/ cvs.height, 0.2, 100);


device.queue.writeBuffer(uniformBuffer, 0, PROJMATRIX); 
device.queue.writeBuffer(uniformBuffer, 64, VIEWMATRIX);

  glMatrix.mat4.translate(MODELMATRIX, MODELMATRIX, [0.0,0.0,2.0] );
  glMatrix.mat4.scale(MODELMATRIX, MODELMATRIX, [0.2,0.2,0.2] );

device.queue.writeBuffer(uniformBuffer, 64+64, MODELMATRIX);

console.log(vertexData.length)
console.log(indexData.length)

  let then =0;
    let render = function (now) {
      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();
      const renderPassDescriptor = {
        colorAttachments: [{
          view: textureView,
          loadValue: {r: 0.0, g: 0.0, b: 0.3, a: 1.0},
          storeOp: 'store'
        }],
        depthStencilAttachment: {
          view: depthView,
          depthLoadValue: 1.0,
          depthStoreOp: "store",
          stencilLoadValue: 0,
          stencilStoreOp: "store"
      }
      };
      
      now *= 0.001;  // convert to seconds
      const deltaTime = now - then;
      then = now;

        glMatrix.mat4.rotateY(MODELMATRIX, MODELMATRIX, deltaTime/2);
        glMatrix.mat4.rotateX(MODELMATRIX, MODELMATRIX, deltaTime );
       // glMatrix.mat4.rotateZ(MODELMATRIX, MODELMATRIX, deltaTime/2 );

      device.queue.writeBuffer(uniformBuffer, 64+64, MODELMATRIX);

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setVertexBuffer(0, vertexBuffer);
      passEncoder.setIndexBuffer(indexBuffer, "uint32");
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, uniformBindGroup);
      
      passEncoder.drawIndexed(indexData.length);
      passEncoder.end();
      const test = commandEncoder.finish();
      device.queue.submit([test]);

      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);


    }